# AMD GPUs Supported by ROCm

Tabla completa de GPUs AMD compatibles con ROCm, organizadas por
arquitectura GFX.  Útil para determinar qué versión de ROCm instalar y
cómo configurar `HSA_OVERRIDE_GFX_VERSION`.

> **Prioridad**: MI300X (gfx942) es el objetivo principal del
> hackathon.  ROCm 7.2.x es la versión recomendada.

## Tabla Completa de GPUs AMD

| Arquitectura GFX | GPU (Codename) | Nombre Comercial | VRAM | ROCm Mínimo | Estado |
|:----------------:|----------------|------------------|:----:|:-----------:|:------:|
| gfx900 | Vega 10 | Radeon Instinct MI25, WX 9100 | 16 GB HBM2 | 5.0 | ✅ Soportado |
| gfx906 | Vega 20 | Radeon Instinct MI50, MI60 | 32 GB HBM2 | 5.0 | ✅ Soportado |
| gfx908 | CDNA1 | Radeon Instinct MI100 | 32 GB HBM2e | 5.0 | ✅ Soportado |
| gfx90a | CDNA2 | Radeon Instinct MI210 | 64 GB HBM2e | 5.3 | ✅ Soportado |
| gfx90a | CDNA2 | Radeon Instinct MI250 | 128 GB HBM2e | 5.3 | ✅ Soportado |
| gfx90a | CDNA2 | Radeon Instinct MI250X | 128 GB HBM2e | 5.3 | ✅ Soportado |
| gfx940 | CDNA3 | AMD Instinct MI300A | 128 GB HBM3 | 6.0 | ✅ Soportado |
| gfx941 | CDNA3 | AMD Instinct MI300X (early) | 192 GB HBM3 | 6.0 | ✅ Soportado |
| **gfx942** | **CDNA3** | **AMD Instinct MI300X** | **192 GB HBM3** | **6.1** | **✅ PRIORIDAD** |
| gfx942 | CDNA3 | AMD Instinct MI325X | 288 GB HBM3e | 6.2 | ✅ Soportado |
| gfx950 | CDNA4 | AMD Instinct MI350X | 288 GB HBM3e | 6.3 | ✅ Soportado |
| gfx950 | CDNA4 | AMD Instinct MI355X | 288 GB HBM3e | 6.3 | ✅ Soportado |
| gfx1030 | RDNA2 | Radeon RX 6800/6800 XT/6900 XT | 16 GB GDDR6 | 5.0 | ✅ Soportado |
| gfx1030 | RDNA2 | Radeon PRO W6800 | 32 GB GDDR6 | 5.0 | ✅ Soportado |
| gfx1031 | RDNA2 | Radeon RX 6700 XT | 12 GB GDDR6 | 5.0 | ⚠️ Parcial |
| gfx1100 | RDNA3 | Radeon RX 7600/7700 XT/7800 XT | 8-16 GB GDDR6 | 6.0 | ✅ Soportado |
| gfx1100 | RDNA3 | Radeon RX 7900 GRE/XT/XTX | 16-24 GB GDDR6 | 6.0 | ✅ Soportado |
| gfx1101 | RDNA3 | Radeon RX 7900 GRE (algunas) | 16 GB GDDR6 | 6.0 | ✅ Soportado |
| gfx1102 | RDNA3 | Radeon RX 7700 (algunas) | 8 GB GDDR6 | 6.0 | ⚠️ Parcial |
| gfx1150 | RDNA3.5 | Radeon RX 8600/8700 series | 8-16 GB GDDR6 | 6.3 | ✅ Soportado |
| gfx1151 | RDNA3.5 | Radeon RX 8800/8900 series | 16-24 GB GDDR6 | 6.3 | ✅ Soportado |
| gfx1200 | RDNA4 | Radeon RX 9060 series | 8 GB GDDR6 | 6.4 | ✅ Soportado |
| gfx1201 | RDNA4 | Radeon RX 9070 / 9070 XT | 16 GB GDDR6 | 6.4 | ✅ Soportado |

## Notas por Generación

### CDNA1 (gfx908) — MI100
- Primera generación de arquitectura CDNA dedicada a cómputo.
- Soporte completo en ROCm 5.x/6.x.
- Matrix Cores (equivalente a Tensor Cores de NVIDIA).

### CDNA2 (gfx90a) — MI210 / MI250 / MI250X
- Arquitectura más desplegada en clústeres HPC actuales.
- MI250X tiene 2 dies de 64 GB HBM2e cada uno (128 GB total).
- ROCm 5.3+ requerido.
- Soporte para FP8 en ROCm 6.x.

### CDNA3 (gfx940/gfx941/gfx942) — MI300A / MI300X / MI325X
- **MI300X (gfx942)** es la GPU objetivo.
- 192 GB HBM3 con 5.2 TB/s de ancho de banda.
- Matrix Cores de 4ª generación con soporte FP8 y FP16.
- MI325X (gfx942) extiende a 288 GB con HBM3e.
- ROCm 6.1+ requerido para gfx942.

### CDNA4 (gfx950) — MI350X / MI355X
- Última generación al momento de escribir.
- MI355X con 288 GB HBM3e.
- ROCm 6.3+ requerido.

### RDNA3 (gfx1100) — RX 7900 series
- GPUs de consumo (gaming/workstation).
- Soporte oficial desde ROCm 6.0.
- Ideal para desarrollo y prototipado en escritorio.

### RDNA4 (gfx1201) — RX 9070 / 9070 XT
- GPUs de consumo de última generación.
- Soporte desde ROCm 6.4.
- 16 GB GDDR6, adecuado para fine-tuning de modelos medianos.

## HSA_OVERRIDE_GFX_VERSION

Para GPUs más nuevas que no están oficialmente soportadas por la versión de
ROCm instalada, se puede usar `HSA_OVERRIDE_GFX_VERSION` para simular una
arquitectura anterior.  **Usar con precaución**: puede causar inestabilidad
o rendimiento subóptimo.

### Ejemplos de Override

| GPU Real | GFX Real | ROCm Requerido | Override | Simula |
|----------|:--------:|:--------------:|:--------:|:------:|
| RX 7900 XTX | gfx1100 | 6.0 | `10.3.0` | gfx1030 |
| RX 9070 XT | gfx1201 | 6.4 | `11.0.0` | gfx1100 |
| MI300X | gfx942 | 6.1 | `9.4.2` | gfx942 (no suele necesitar) |

### Uso

```bash
# Bash: export antes de ejecutar
export HSA_OVERRIDE_GFX_VERSION=10.3.0
python3 train.py

# Inline: para un solo comando
HSA_OVERRIDE_GFX_VERSION=10.3.0 python3 train.py

# Docker: pasar como variable de entorno
docker run --device=/dev/kfd --device=/dev/dri \
  -e HSA_OVERRIDE_GFX_VERSION=10.3.0 \
  -e HIP_VISIBLE_DEVICES=0 \
  my-rocm-image
```

### Cómo Determinar el Valor de Override

El override usa el formato `X.Y.Z` donde:
- `X` = Major version de la arquitectura GFX (gfx1030 → 10)
- `Y` = Minor version (gfx1030 → 3)
- `Z` = Patch (gfx1030 → 0)

Mapping:
| GFX | Override |
|:---:|:--------:|
| gfx900 | `9.0.0` |
| gfx906 | `9.0.6` |
| gfx908 | `9.0.8` |
| gfx90a | `9.0.10` |
| gfx942 | `9.4.2` |
| gfx1030 | `10.3.0` |
| gfx1100 | `11.0.0` |
| gfx1201 | `12.0.1` |

## Cómo Detectar tu GFX Architecture

```bash
# Método 1: rocminfo (recomendado)
rocminfo | grep -E "^\s*Name:\s+gfx"

# Método 2: python detect-gpu.py
python3 scripts/detect-gpu.py --json | grep gfx_arch

# Método 3: Python directo
python3 -c "
import subprocess, re
out = subprocess.run(['rocminfo'], capture_output=True, text=True)
for line in out.stdout.split('\n'):
    m = re.search(r'(gfx\d+)', line)
    if m:
        print(f'Arquitectura: {m.group(1)}')
"
```

## Referencias

- [ROCm Documentation — Hardware Support](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/reference/system-requirements.html)
- [ROCm GitHub — GPU Support Matrix](https://github.com/RadeonOpenCompute/ROCm)
- [PyTorch ROCm Installation Guide](https://pytorch.org/get-started/locally/)
