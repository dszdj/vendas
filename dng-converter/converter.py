import os
import numpy as np
import rawpy
from PIL import Image, ImageOps
from pathlib import Path

def ajustar_exposicao_e_contraste(img_np):
    """
    Analisa o brilho e contraste da imagem numpy (RGB) e aplica 
    correções automáticas se a imagem estiver com a exposição muito alta.
    """
    cinza = np.mean(img_np, axis=2)
    brilho_medio = np.mean(cinza)
    
    print(f"  -> Brilho médio detectado: {brilho_medio:.1f}")
    
    if brilho_medio > 135:
        print("  -> Exposição alta detectada! Aplicando ajuste automático de brilho/contraste...")
        img_pil = Image.fromarray(img_np)
        img_corrigida = ImageOps.autocontrast(img_pil, cutoff=2)
        return np.array(img_corrigida)
    
    return img_np

def converter_dng_para_jpg(pasta_origem, qualidade=90):
    """
    Converte todas as imagens .dng para .jpg, pulando as que já existem na pasta de saída.
    """
    origem = Path(pasta_origem)
    
    if not origem.exists():
        print(f"Erro: A pasta '{pasta_origem}' não foi encontrada.")
        return

    destino = origem / "converted-output"
    destino.mkdir(parents=True, exist_ok=True)

    arquivos_dng = list(origem.glob("*.dng")) + list(origem.glob("*.DNG"))

    if not arquivos_dng:
        print(f"Nenhum arquivo .dng encontrado em '{pasta_origem}'.")
        return

    print(f"Encontrados {len(arquivos_dng)} arquivos .dng na pasta.")
    print(f"Destino: {destino}\nIniciando verificação...\n")

    convertidos = 0
    pulados = 0

    for i, arquivo_dng in enumerate(arquivos_dng, 1):
        caminho_jpg = destino / f"{arquivo_dng.stem}.jpg"
        
        # VERIFICAÇÃO: Se o JPG já existir, pula o arquivo atual
        if caminho_jpg.exists():
            print(f"[{i}/{len(arquivos_dng)}] Pulado: {arquivo_dng.name} (já existe em converted-output)")
            pulados += 1
            continue

        try:
            print(f"[{i}/{len(arquivos_dng)}] Convertendo: {arquivo_dng.name}...")
            
            # Abre o DNG e processa
            with rawpy.imread(str(arquivo_dng)) as raw:
                rgb = raw.postprocess(
                    use_camera_wb=True,
                    bright=1.0,
                    highlight_mode=2
                )
            
            # Ajusta exposição se necessário
            rgb_ajustado = ajustar_exposicao_e_contraste(rgb)
            
            # Salva o JPG
            img = Image.fromarray(rgb_ajustado)
            img.save(caminho_jpg, "JPEG", quality=qualidade)
            print(f"  -> Salvo com sucesso!\n")
            convertidos += 1
            
        except Exception as e:
            print(f"  -> Erro ao converter {arquivo_dng.name}: {e}\n")

    print("="*40)
    print(f"Processo concluído!")
    print(f"• Convertidos agora: {convertidos}")
    print(f"• Já existentes (pulados): {pulados}")
    print("="*40)

if __name__ == "__main__":
    PASTA_ALVO = input("Digite o caminho da pasta com os arquivos .dng: ").strip()
    converter_dng_para_jpg(PASTA_ALVO)