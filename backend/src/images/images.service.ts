import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface UploadedImage {
  mimetype: string;
  buffer: Buffer;
}

interface ComfyInputMapping {
  nodeId: string;
  input: string;
}

interface ComfyWorkflowInputs {
  prompt: ComfyInputMapping;
  reference: ComfyInputMapping;
  products: ComfyInputMapping[];
}

interface ComfyNode {
  inputs?: Record<string, unknown>;
}

interface ComfyImageUpload {
  name?: string;
}

interface ComfyOutputImage {
  filename?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyOutputImage[] }>;
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 5 * 60_000;
const supportedImageTypes: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": (buffer) => buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (buffer) => buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP",
};
const imageExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

@Injectable()
export class ImagesService {
  async generate(prompt: string, productImages: UploadedImage[], referenceImages: UploadedImage[]) {
    if (productImages.length < 1 || productImages.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(`Envie de 1 a ${MAX_PRODUCT_IMAGES} fotos do produto.`);
    }
    if (referenceImages.length !== 1) {
      throw new BadRequestException("Envie uma foto de referência.");
    }
    for (const image of [...productImages, ...referenceImages]) {
      if (image.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException("Cada imagem deve ter no máximo 4 MB.");
      }
      if (!supportedImageTypes[image.mimetype]?.(image.buffer)) {
        throw new BadRequestException("Uma das imagens é inválida. Use arquivos JPEG, PNG ou WebP.");
      }
    }

    const baseUrl = this.getBaseUrl();
    const workflow = await this.loadWorkflow();
    const mappings = this.getWorkflowInputs();
    this.validateWorkflowInputs(workflow, mappings, productImages.length);

    const referenceUpload = await this.uploadImage(baseUrl, referenceImages[0]);
    const productUploads: ComfyImageUpload[] = [];
    for (const image of productImages) {
      productUploads.push(await this.uploadImage(baseUrl, image));
    }

    const imageForMapping = (index: number) => productUploads[Math.min(index, productUploads.length - 1)];
    this.setWorkflowInput(workflow, mappings.prompt, this.createInstructions(prompt));
    this.setWorkflowInput(workflow, mappings.reference, referenceUpload.name!);
    mappings.products.forEach((mapping, index) => {
      this.setWorkflowInput(workflow, mapping, imageForMapping(index).name!);
    });

    const promptId = await this.queueWorkflow(baseUrl, workflow);
    const outputImage = await this.waitForImage(baseUrl, promptId);
    return this.downloadImage(baseUrl, outputImage);
  }

  private getBaseUrl(): string {
    const configured = process.env.COMFYUI_BASE_URL?.trim();
    if (!configured) {
      throw new ServiceUnavailableException("Configure COMFYUI_BASE_URL no .env para conectar ao ComfyUI.");
    }
    try {
      const url = new URL(configured);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol.");
      return url.toString().replace(/\/+$/, "");
    } catch {
      throw new ServiceUnavailableException("COMFYUI_BASE_URL precisa ser uma URL HTTP ou HTTPS válida.");
    }
  }

  private async loadWorkflow(): Promise<Record<string, ComfyNode>> {
    const configuredPath = process.env.COMFYUI_WORKFLOW_PATH?.trim();
    if (!configuredPath) {
      throw new ServiceUnavailableException("Configure COMFYUI_WORKFLOW_PATH com o caminho do workflow API do Nano Banana.");
    }

    let content: string;
    try {
      content = await readFile(resolve(process.cwd(), configuredPath), "utf8");
    } catch {
      throw new ServiceUnavailableException("Não foi possível ler COMFYUI_WORKFLOW_PATH. Confira o caminho do arquivo no servidor.");
    }

    let workflow: unknown;
    try {
      workflow = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException("O arquivo COMFYUI_WORKFLOW_PATH não contém um JSON válido.");
    }
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      throw new ServiceUnavailableException("Use no COMFYUI_WORKFLOW_PATH um workflow exportado no formato API do ComfyUI.");
    }
    return workflow as Record<string, ComfyNode>;
  }

  private getWorkflowInputs(): ComfyWorkflowInputs {
    const configured = process.env.COMFYUI_WORKFLOW_INPUTS_JSON?.trim();
    if (!configured) {
      throw new ServiceUnavailableException(
        "Configure COMFYUI_WORKFLOW_INPUTS_JSON com os IDs dos nós de prompt, referência e fotos do produto.",
      );
    }

    let inputs: unknown;
    try {
      inputs = JSON.parse(configured);
    } catch {
      throw new ServiceUnavailableException("COMFYUI_WORKFLOW_INPUTS_JSON precisa conter um JSON válido.");
    }

    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      throw new ServiceUnavailableException("COMFYUI_WORKFLOW_INPUTS_JSON precisa ser um objeto JSON.");
    }
    const candidate = inputs as Partial<ComfyWorkflowInputs>;
    if (!this.isMapping(candidate.prompt) || !this.isMapping(candidate.reference)
      || !Array.isArray(candidate.products) || candidate.products.length < 1
      || candidate.products.length > MAX_PRODUCT_IMAGES || !candidate.products.every((mapping) => this.isMapping(mapping))) {
      throw new ServiceUnavailableException(
        "COMFYUI_WORKFLOW_INPUTS_JSON deve mapear prompt, reference e de 1 a 4 entradas products com nodeId e input.",
      );
    }
    return candidate as ComfyWorkflowInputs;
  }

  private isMapping(value: unknown): value is ComfyInputMapping {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const mapping = value as Partial<ComfyInputMapping>;
    return typeof mapping.nodeId === "string" && mapping.nodeId.trim().length > 0
      && typeof mapping.input === "string" && mapping.input.trim().length > 0;
  }

  private validateWorkflowInputs(
    workflow: Record<string, ComfyNode>,
    mappings: ComfyWorkflowInputs,
    productImageCount: number,
  ): void {
    if (productImageCount > mappings.products.length) {
      throw new BadRequestException(
        `Este workflow aceita até ${mappings.products.length} fotos do produto. Ajuste os nós de entrada do workflow ou envie menos fotos.`,
      );
    }
    for (const mapping of [mappings.prompt, mappings.reference, ...mappings.products]) {
      const node = workflow[mapping.nodeId];
      if (!node || !node.inputs || !(mapping.input in node.inputs)) {
        throw new ServiceUnavailableException(
          `O mapeamento do workflow aponta para o nó ${mapping.nodeId}, entrada "${mapping.input}", que não existe no JSON exportado.`,
        );
      }
    }
  }

  private setWorkflowInput(workflow: Record<string, ComfyNode>, mapping: ComfyInputMapping, value: string): void {
    workflow[mapping.nodeId].inputs![mapping.input] = value;
  }

  private createInstructions(prompt: string): string {
    return [
      "Crie uma foto de moda realista substituindo a roupa vestida pela pessoa na foto de referência pela peça mostrada nas fotos do produto.",
      "A imagem de referência define a pessoa, a pose, o cenário e o enquadramento. As imagens de produto mostram a roupa que deve ser vestida.",
      "Preserve a identidade, pose, proporções, cenário, enquadramento e iluminação da referência. Reproduza com fidelidade cores, estampas, textura, modelagem e detalhes visíveis nas fotos do produto.",
      "Faça a peça vestir naturalmente. Não adicione texto, logotipos ou acessórios ausentes nas referências.",
      prompt.trim() ? `Direção criativa adicional: ${prompt.trim()}` : "",
    ].filter(Boolean).join("\n\n");
  }

  private async uploadImage(baseUrl: string, image: UploadedImage): Promise<ComfyImageUpload> {
    const body = new FormData();
    const imageBytes = new ArrayBuffer(image.buffer.byteLength);
    new Uint8Array(imageBytes).set(image.buffer);
    const file = new Blob([imageBytes], { type: image.mimetype });
    body.append("image", file, `aura-${randomUUID()}${imageExtensions[image.mimetype]}`);
    body.append("type", "input");
    body.append("overwrite", "true");

    const result = await this.requestJson(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: this.getHeaders(),
      body,
    }, "enviar imagens ao ComfyUI");
    if (!result || typeof result !== "object" || typeof (result as ComfyImageUpload).name !== "string") {
      throw new BadGatewayException("O ComfyUI não retornou o nome do arquivo enviado.");
    }
    return result as ComfyImageUpload;
  }

  private async queueWorkflow(baseUrl: string, workflow: Record<string, ComfyNode>): Promise<string> {
    const result = await this.requestJson(`${baseUrl}/prompt`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
    }, "enfileirar o workflow no ComfyUI");
    if (!result || typeof result !== "object" || typeof (result as { prompt_id?: unknown }).prompt_id !== "string") {
      const nodeErrors = result && typeof result === "object" && "node_errors" in result
        ? JSON.stringify((result as { node_errors: unknown }).node_errors).slice(0, 500)
        : "";
      throw new BadGatewayException(nodeErrors
        ? `O ComfyUI rejeitou o workflow. Confira os nós e dependências do Nano Banana: ${nodeErrors}`
        : "O ComfyUI não retornou o ID da execução. Confira o workflow exportado no formato API.");
    }
    return (result as { prompt_id: string }).prompt_id;
  }

  private async waitForImage(baseUrl: string, promptId: string): Promise<ComfyOutputImage> {
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
      const history = await this.requestJson(
        `${baseUrl}/history/${encodeURIComponent(promptId)}`,
        { headers: this.getHeaders() },
        "consultar o resultado da execução no ComfyUI",
      );
      const entry = history && typeof history === "object"
        ? (history as Record<string, ComfyHistoryEntry>)[promptId]
        : undefined;
      if (!entry) continue;

      const images = Object.values(entry.outputs ?? {}).flatMap((output) => output.images ?? []);
      const image = images.find((item) => typeof item.filename === "string" && item.filename.length > 0);
      if (image) return image;
      if (entry.status?.completed || entry.status?.status_str === "error") {
        const details = JSON.stringify(entry.status.messages ?? []).slice(0, 500);
        throw new BadGatewayException(details
          ? `O workflow do ComfyUI terminou sem imagem. Confira o Nano Banana e os nós do workflow: ${details}`
          : "O workflow do ComfyUI terminou sem retornar uma imagem. Confira o nó de saída SaveImage.");
      }
    }
    throw new ServiceUnavailableException("O ComfyUI ainda não concluiu a geração após 5 minutos. Verifique a fila e a instância.");
  }

  private async downloadImage(baseUrl: string, image: ComfyOutputImage) {
    const params = new URLSearchParams({
      filename: image.filename!,
      subfolder: image.subfolder ?? "",
      type: image.type ?? "output",
    });
    const response = await this.request(`${baseUrl}/view?${params}`, {
      headers: this.getHeaders(),
    }, "baixar a imagem gerada do ComfyUI");
    if (!response.ok) {
      throw new BadGatewayException(`O ComfyUI não conseguiu disponibilizar a imagem gerada (HTTP ${response.status}).`);
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      throw new BadGatewayException("O ComfyUI retornou um formato de imagem não compatível.");
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (!supportedImageTypes[mimeType]?.(data)) {
      throw new BadGatewayException("O arquivo retornado pelo ComfyUI não é uma imagem válida.");
    }
    return { mimeType, data: data.toString("base64") };
  }

  private getHeaders(): Headers {
    const headers = new Headers();
    const apiKey = process.env.COMFYUI_API_KEY?.trim();
    if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
    return headers;
  }

  private async requestJson(url: string, init: RequestInit, action: string): Promise<unknown> {
    const response = await this.request(url, init, action);
    const body = await response.text();
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      if (!response.ok) {
        throw new BadGatewayException(`Falha ao ${action} (HTTP ${response.status}). Verifique a instância e a API do ComfyUI.`);
      }
      throw new BadGatewayException(`A API do ComfyUI retornou uma resposta JSON inválida ao ${action}.`);
    }
    if (!response.ok) {
      const details = result && typeof result === "object" && "error" in result
        ? JSON.stringify((result as { error: unknown }).error).slice(0, 400)
        : "";
      throw new BadGatewayException(details
        ? `Falha ao ${action}: ${details}`
        : `Falha ao ${action} (HTTP ${response.status}). Confira a instância do ComfyUI.`);
    }
    return result;
  }

  private async request(url: string, init: RequestInit, action: string): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ServiceUnavailableException(`Tempo esgotado ao ${action}. Confira se o ComfyUI está acessível.`);
      }
      throw new ServiceUnavailableException(`Não foi possível ${action}. Confira COMFYUI_BASE_URL e a conexão com o ComfyUI.`);
    }
  }
}
