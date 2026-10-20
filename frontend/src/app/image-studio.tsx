"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const maxImageBytes = 4 * 1024 * 1024;
const maxProductImages = 4;

type ImageFile = { file: File; url: string };
type GeneratedImage = { mimeType: string; data: string };

function isSupportedImage(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

function imageDataUrl(image: GeneratedImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

function imageFileExtension(mimeType: string): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
}

export default function ImageStudio({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [productImages, setProductImages] = useState<ImageFile[]>([]);
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function releaseImageUrl(url: string) {
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }

  function acceptImages(
    event: ChangeEvent<HTMLInputElement>,
    kind: "product" | "reference",
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    const invalidFile = files.find((file) => !isSupportedImage(file) || file.size > maxImageBytes);
    if (invalidFile) {
      setNotice("Use imagens JPEG, PNG ou WebP de até 4 MB cada.");
      setNoticeIsError(true);
      return;
    }
    if (kind === "product" && productImages.length + files.length > maxProductImages) {
      setNotice(`Adicione no máximo ${maxProductImages} fotos do produto.`);
      setNoticeIsError(true);
      return;
    }

    const additions = files.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { file, url };
    });
    if (kind === "product") setProductImages((current) => [...current, ...additions]);
    else {
      if (referenceImage) releaseImageUrl(referenceImage.url);
      setReferenceImage(additions[0]);
      additions.slice(1).forEach((image) => releaseImageUrl(image.url));
    }
    setResult(null);
    setNotice("");
  }

  function removeProductImage(image: ImageFile) {
    releaseImageUrl(image.url);
    setProductImages((current) => current.filter((item) => item !== image));
    setResult(null);
  }

  function removeReferenceImage() {
    if (referenceImage) releaseImageUrl(referenceImage.url);
    setReferenceImage(null);
    setResult(null);
  }

  async function generateImage() {
    if (!productImages.length || !referenceImage || loading) return;
    setLoading(true);
    setNotice("");
    setResult(null);

    const formData = new FormData();
    productImages.forEach(({ file }) => formData.append("productImages", file));
    formData.append("referenceImage", referenceImage.file);
    formData.append("prompt", prompt);

    try {
      const response = await fetch(`${API_URL}/api/images/generate`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) {
          onUnauthorized();
          throw new Error("Sua sessão expirou. Entre novamente para continuar.");
        }
        const message = payload && typeof payload === "object" && "message" in payload
          ? payload.message
          : "Não foi possível gerar a imagem.";
        throw new Error(Array.isArray(message) ? message.join(" ") : String(message));
      }
      if (!payload || typeof payload !== "object" || !("data" in payload) || !("mimeType" in payload)
        || typeof payload.data !== "string" || typeof payload.mimeType !== "string") {
        throw new Error("A resposta da API não contém uma imagem válida.");
      }
      setResult({ data: payload.data, mimeType: payload.mimeType });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível gerar a imagem.");
      setNoticeIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="image-studio">
      <section className="studio-intro">
        <div className="studio-sparkle" aria-hidden="true">✳</div>
        <p className="eyebrow">ESTÚDIO DE CRIAÇÃO</p>
        <h2>Vista suas ideias com IA</h2>
        <p>Combine a foto da sua peça com uma referência e crie uma nova imagem de moda.</p>
      </section>

      {notice && <div className={`studio-notice ${noticeIsError ? "studio-notice-error" : ""}`} role="status">{notice}</div>}

      <section className="studio-workspace" aria-label="Criar imagem com IA">
        <div className="studio-upload-grid">
          <div className="studio-upload-card">
            <div className="studio-card-heading">
              <span className="studio-step">1</span>
              <div><strong>Foto do produto</strong><span>Mostre a peça que será vestida</span></div>
              <span className="studio-count">{productImages.length}/{maxProductImages}</span>
            </div>
            <label className="studio-dropzone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={productImages.length >= maxProductImages || loading}
                onChange={(event) => acceptImages(event, "product")}
              />
              <span className="studio-upload-icon" aria-hidden="true">＋</span>
              <strong>Adicionar fotos da peça</strong>
              <span>JPEG, PNG ou WebP · até 4 MB cada</span>
            </label>
            {productImages.length > 0 && (
              <div className="studio-preview-grid">
                {productImages.map((image) => (
                  <div className="studio-preview" key={image.url}>
                    <img src={image.url} alt={`Peça: ${image.file.name}`} />
                    <button type="button" onClick={() => removeProductImage(image)} disabled={loading} aria-label={`Remover ${image.file.name}`}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="studio-upload-card">
            <div className="studio-card-heading">
              <span className="studio-step">2</span>
              <div><strong>Foto de referência</strong><span>Pose, modelo e cenário desejados</span></div>
            </div>
            {referenceImage ? (
              <div className="studio-reference-preview">
                <img src={referenceImage.url} alt={`Referência: ${referenceImage.file.name}`} />
                <button type="button" onClick={removeReferenceImage} disabled={loading}>Trocar referência</button>
              </div>
            ) : (
              <label className="studio-dropzone studio-reference-dropzone">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={loading}
                  onChange={(event) => acceptImages(event, "reference")}
                />
                <span className="studio-upload-icon" aria-hidden="true">▧</span>
                <strong>Adicionar foto de referência</strong>
                <span>Uma imagem · JPEG, PNG ou WebP · até 4 MB</span>
              </label>
            )}
          </div>
        </div>

        <label className="studio-prompt-label" htmlFor="image-prompt">Personalize o resultado <span>opcional</span></label>
        <textarea
          id="image-prompt"
          className="studio-prompt"
          maxLength={1500}
          placeholder="Ex.: ensaio editorial ao ar livre, luz suave de fim de tarde..."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={loading}
          rows={3}
        />
        <div className="studio-prompt-footer">
          <span>O workflow Nano Banana preserva a referência e aplica nela os detalhes da peça.</span>
          <button className="button button-dark studio-generate-button" type="button" onClick={() => void generateImage()} disabled={!productImages.length || !referenceImage || loading}>
            {loading ? <><span className="studio-spinner" aria-hidden="true" /> Criando imagem...</> : <><span aria-hidden="true">✦</span> Gerar imagem</>}
          </button>
        </div>
      </section>

      {loading && (
        <div className="studio-loading" role="status">
          <span className="studio-spinner" aria-hidden="true" />
          <div><strong>Criando sua imagem</strong><span>O ComfyUI está processando o workflow Nano Banana. Isso pode levar alguns instantes.</span></div>
        </div>
      )}

      {result && (
        <section className="studio-result">
          <div className="studio-result-heading"><div><p className="eyebrow">IMAGEM GERADA</p><h3>Seu novo ensaio</h3></div><a className="button button-light" href={imageDataUrl(result)} download={`aura-imagem-ia.${imageFileExtension(result.mimeType)}`}>↓ Baixar imagem</a></div>
          <img className="studio-result-image" src={imageDataUrl(result)} alt="Imagem de moda gerada com IA" />
          <p>Imagem gerada por IA. Confira os detalhes da peça antes de publicar.</p>
        </section>
      )}

      <p className="studio-footnote"><span aria-hidden="true">✦</span> As imagens são enviadas à sua instância ComfyUI; arquivos de entrada e saída podem permanecer armazenados nela.</p>
    </div>
  );
}
