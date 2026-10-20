import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface UploadedImage {
  mimetype: string;
  buffer: Buffer;
}

interface ComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  extra_data?: unknown;
  _meta?: { title?: string };
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

interface WorkflowNode {
  id: string;
  node: ComfyNode;
}

const COMFYUI_BASE_URL = "http://127.0.0.1:8188";
const WORKFLOW_PATH = resolve(__dirname, "../../workflows/api_google_nano_banana2_image_edit.json");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  async generate(prompt: string, product: UploadedImage[], reference: UploadedImage[]) {
    if (product.length !== 1) {
      throw new BadRequestException("Envie uma foto do produto.");
    }
    if (reference.length !== 1) {
      throw new BadRequestException("Envie uma foto de referência.");
    }
    for (const image of [...product, ...reference]) {
      if (image.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException("Cada imagem deve ter no máximo 10 MB.");
      }
      if (!supportedImageTypes[image.mimetype]?.(image.buffer)) {
        throw new BadRequestException("Uma das imagens é inválida. Use arquivos JPEG, PNG ou WebP.");
      }
    }

    const workflow = await this.loadWorkflow();
    const productNode = this.findNode(workflow, "product", "LoadImage");
    const referenceNode = this.findNode(workflow, "ref", "LoadImage");
    const promptNode = this.findNode(workflow, "prompt", "PrimitiveStringMultiline");
    const nanoBananaNode = this.findNode(workflow, "Nano Banana 2", "GeminiNanoBanana2V2");
    const saveNode = this.findNode(workflow, "save", "SaveImage");

    this.setImageInput(productNode, await this.uploadImage(product[0]));
    this.setImageInput(referenceNode, await this.uploadImage(reference[0]));
    this.setInput(promptNode, "value", prompt);
    this.setInput(nanoBananaNode, "model.images.image_1", [productNode.id, 0]);
    this.setInput(nanoBananaNode, "model.images.image_2", [referenceNode.id, 0]);
    this.setInput(nanoBananaNode, "system_prompt", "");
    if ("seed" in (nanoBananaNode.node.inputs ?? {})) {
      this.setInput(nanoBananaNode, "seed", randomInt(0, 2 ** 32));
    }

    const partnerApiKey = this.extractPartnerApiKey(nanoBananaNode);
    const promptId = await this.queueWorkflow(workflow, partnerApiKey);
    const outputImage = await this.waitForImage(promptId, saveNode.id);
    return this.downloadImage(outputImage);
  }

  private async loadWorkflow(): Promise<Record<string, ComfyNode>> {
    let content: string;
    try {
      content = await readFile(WORKFLOW_PATH, "utf8");
    } catch {
      throw new ServiceUnavailableException(
        "Não foi possível ler o workflow Nano Banana em backend/workflows/api_google_nano_banana2_image_edit.json.",
      );
    }

    let workflow: unknown;
    try {
      workflow = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException("O workflow Nano Banana não contém um JSON válido.");
    }
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      throw new ServiceUnavailableException("O workflow Nano Banana precisa estar no formato API do ComfyUI.");
    }
    return workflow as Record<string, ComfyNode>;
  }

  private findNode(workflow: Record<string, ComfyNode>, title: string, classType: string): WorkflowNode {
    const matches = Object.entries(workflow)
      .filter(([, node]) => node._meta?.title?.toLocaleLowerCase("pt-BR") === title.toLocaleLowerCase("pt-BR"));
    if (matches.length !== 1 || matches[0][1].class_type !== classType || !matches[0][1].inputs) {
      throw new ServiceUnavailableException(
        `Não foi possível localizar o nó "${title}" (${classType}) no workflow Nano Banana.`,
      );
    }
    return { id: matches[0][0], node: matches[0][1] };
  }

  private setImageInput(node: WorkflowNode, image: ComfyImageUpload): void {
    this.setInput(node, "image", image.name!);
  }

  private setInput(node: WorkflowNode, input: string, value: unknown): void {
    if (!node.node.inputs || !(input in node.node.inputs)) {
      throw new ServiceUnavailableException(
        `A entrada "${input}" não existe no nó "${node.node._meta?.title ?? node.id}" do workflow Nano Banana.`,
      );
    }
    node.node.inputs[input] = value;
  }

  private extractPartnerApiKey(node: WorkflowNode): string {
    const extraData = node.node.extra_data ?? node.node.inputs?.extra_data;
    if (!extraData || typeof extraData !== "object" || Array.isArray(extraData)) {
      throw new ServiceUnavailableException(
        "Adicione a chave da conta ComfyUI em extra_data.api_key_comfy_org no nó Nano Banana.",
      );
    }
    const apiKey = (extraData as Record<string, unknown>).api_key_comfy_org;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new ServiceUnavailableException(
        "A entrada extra_data do nó Nano Banana precisa conter api_key_comfy_org.",
      );
    }

    delete node.node.extra_data;
    if (node.node.inputs) delete node.node.inputs.extra_data;
    return apiKey.trim();
  }

  private async uploadImage(image: UploadedImage): Promise<ComfyImageUpload> {
    const body = new FormData();
    const imageBytes = new ArrayBuffer(image.buffer.byteLength);
    new Uint8Array(imageBytes).set(image.buffer);
    body.append(
      "image",
      new Blob([imageBytes], { type: image.mimetype }),
      `aura-${randomUUID()}${imageExtensions[image.mimetype]}`,
    );
    body.append("type", "input");
    body.append("overwrite", "true");

    const result = await this.requestJson(`${COMFYUI_BASE_URL}/upload/image`, {
      method: "POST",
      body,
    }, "enviar uma imagem ao ComfyUI");
    if (!result || typeof result !== "object" || typeof (result as ComfyImageUpload).name !== "string") {
      throw new BadGatewayException("O ComfyUI não retornou o nome da imagem enviada.");
    }
    return result as ComfyImageUpload;
  }

  private async queueWorkflow(workflow: Record<string, ComfyNode>, partnerApiKey: string): Promise<string> {
    const result = await this.requestJson(`${COMFYUI_BASE_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: randomUUID(),
        extra_data: { api_key_comfy_org: partnerApiKey },
      }),
    }, "enfileirar o workflow no ComfyUI", [partnerApiKey]);
    if (!result || typeof result !== "object" || typeof (result as { prompt_id?: unknown }).prompt_id !== "string") {
      const nodeErrors = result && typeof result === "object" && "node_errors" in result
        ? JSON.stringify((result as { node_errors: unknown }).node_errors)
          .split(partnerApiKey).join("[redigido]")
          .slice(0, 500)
        : "";
      throw new BadGatewayException(nodeErrors
        ? `O ComfyUI rejeitou o workflow Nano Banana: ${nodeErrors}`
        : "O ComfyUI não retornou o ID da execução. Confira os nós e dependências do workflow.");
    }
    return (result as { prompt_id: string }).prompt_id;
  }

  private async waitForImage(promptId: string, saveNodeId: string): Promise<ComfyOutputImage> {
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
      const history = await this.requestJson(
        `${COMFYUI_BASE_URL}/history/${encodeURIComponent(promptId)}`,
        {},
        "consultar o resultado da execução no ComfyUI",
      );
      const entry = history && typeof history === "object"
        ? (history as Record<string, ComfyHistoryEntry>)[promptId]
        : undefined;
      if (!entry) continue;

      const image = entry.outputs?.[saveNodeId]?.images?.find(
        (item) => typeof item.filename === "string" && item.filename.length > 0,
      );
      if (image) return image;
      if (entry.status?.completed || entry.status?.status_str === "error") {
        const details = JSON.stringify(entry.status.messages ?? []).slice(0, 500);
        throw new BadGatewayException(details
          ? `O workflow Nano Banana terminou sem imagem: ${details}`
          : "O workflow Nano Banana terminou sem imagem na saída \"save\".");
      }
    }
    throw new ServiceUnavailableException(
      "O ComfyUI ainda não concluiu a geração após 5 minutos. Verifique a fila e a instância local.",
    );
  }

  private async downloadImage(image: ComfyOutputImage) {
    const params = new URLSearchParams({
      filename: image.filename!,
      subfolder: image.subfolder ?? "",
      type: image.type ?? "output",
    });
    const response = await this.request(
      `${COMFYUI_BASE_URL}/view?${params}`,
      {},
      "baixar a imagem gerada do ComfyUI",
    );
    if (!response.ok) {
      throw new BadGatewayException(
        `O ComfyUI não conseguiu disponibilizar a imagem gerada (HTTP ${response.status}).`,
      );
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

  private async requestJson(
    url: string,
    init: RequestInit,
    action: string,
    redactValues: string[] = [],
  ): Promise<unknown> {
    const response = await this.request(url, init, action);
    const body = await response.text();
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      if (!response.ok) {
        throw new BadGatewayException(
          `Falha ao ${action} (HTTP ${response.status}). Verifique a API local do ComfyUI.`,
        );
      }
      throw new BadGatewayException(`A API do ComfyUI retornou uma resposta JSON inválida ao ${action}.`);
    }
    if (!response.ok) {
      const details = result && typeof result === "object"
        ? [
          "error" in result ? JSON.stringify((result as { error: unknown }).error) : "",
          "node_errors" in result ? JSON.stringify((result as { node_errors: unknown }).node_errors) : "",
        ].filter(Boolean).join(" | ").slice(0, 500)
        : "";
      const safeDetails = redactValues.reduce(
        (text, value) => text.split(value).join("[redigido]"),
        details,
      );
      throw new BadGatewayException(safeDetails
        ? `Falha ao ${action}: ${safeDetails}`
        : `Falha ao ${action} (HTTP ${response.status}). Confira a API local do ComfyUI.`);
    }
    return result;
  }

  private async request(url: string, init: RequestInit, action: string): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ServiceUnavailableException(
          `Tempo esgotado ao ${action}. Confira se o ComfyUI está rodando em ${COMFYUI_BASE_URL}.`,
        );
      }
      throw new ServiceUnavailableException(
        `Não foi possível ${action}. Confira se o ComfyUI está rodando em ${COMFYUI_BASE_URL}.`,
      );
    }
  }
}
