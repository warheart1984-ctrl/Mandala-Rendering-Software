# ROCm Troubleshooting

Guía de problemas comunes con ROCm, sus causas y soluciones paso a paso.

---

## 1. GPU No Detectada por ROCm

**Síntomas:**
- `rocminfo` no muestra ninguna GPU
- `rocm-smi` muestra "No AMD GPU detected"
- `lspci | grep -i amd` muestra una GPU pero ROCm no la reconoce

**Causas posibles:**
- El módulo del kernel `amdgpu` no está cargado
- La GPU no está visible en el bus PCIe (mal seated o BIOS deshabilitada)
- La GPU no está soportada por la versión de ROCm instalada
- Faltan microcódigos (firmware) de la GPU

**Soluciones:**

```bash
# 1. Verificar que la GPU es visible en PCIe
lspci -nn | grep -iE "amd|radeon" | grep -iE "vga|display|3d"

# 2. Cargar el módulo amdgpu
sudo modprobe amdgpu

# 3. Verificar que el módulo está cargado
lsmod | grep amdgpu

# 4. Revisar firmware
sudo dmesg | grep -i amdgpu | tail -20

# 5. Verificar BIOS del sistema
#   - Habilitar "Above 4G Decoding"
#   - Habilitar "Resizable BAR" (también llamado "Re-Size BAR Support")
#   - Deshabilitar "Secure Boot" (puede bloquear módulos del kernel)
```

Si la GPU aparece en `lspci` pero no en `rocminfo`, puede ser que la versión
de ROCm no soporte esa GPU.  Revisa la tabla en
[references/supported-gpus.md](supported-gpus.md).

---

## 2. `torch.cuda.is_available()` Retorna False

**Síntomas:**
- PyTorch está instalado pero `torch.cuda.is_available()` devuelve `False`
- `import torch` funciona pero no detecta la GPU

**Causas posibles:**
- PyTorch se instaló desde la rueda CUDA por defecto en vez de la rueda ROCm
- La versión de ROCm no coincide con la versión de PyTorch ROCm
- El usuario no tiene permisos para acceder a `/dev/kfd` o `/dev/dri`
- Variable de entorno `HSA_OVERRIDE_GFX_VERSION` incorrecta

**Soluciones:**

```bash
# 1. Verificar qué versión de PyTorch está instalada
python3 -c "import torch; print(torch.__version__)"

# Si ves "+cu118" o similar, instalaste la rueda CUDA
# Si ves "+rocm6.2", instalaste la rueda correcta

# 2. Desinstalar PyTorch e instalar la rueda ROCm
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/rocm6.2

# 3. Verificar versión de ROCm (debe coincidir aproximadamente)
cat /opt/rocm/share/doc/rocm-version/version

# 4. Verificar permisos de dispositivo
ls -la /dev/kfd /dev/dri/render*
# Deberías ver crw-rw---- con grupo "render"

# 5. Verificar grupos del usuario
groups
# Debe incluir "video" y "render"
# Si no: sudo usermod -a -G video,render $USER && newgrp render
```

**Tabla de compatibilidad ROCm ↔ PyTorch:**

| ROCm | PyTorch Index URL |
|------|-------------------|
| 7.2.x | `https://download.pytorch.org/whl/rocm6.2` |
| 7.1.x | `https://download.pytorch.org/whl/rocm6.2` |
| 7.0.x | `https://download.pytorch.org/whl/rocm6.2` |
| 6.3.x | `https://download.pytorch.org/whl/rocm6.2` |
| 6.2.x | `https://download.pytorch.org/whl/rocm6.1` |
| 6.1.x | `https://download.pytorch.org/whl/rocm6.1` |
| 6.0.x | `https://download.pytorch.org/whl/rocm6.0` |

> **Nota**: PyTorch no tiene ruedas ROCm para cada versión de ROCm.
> Siempre usa la rueda ROCm más cercana a tu versión instalada.
> La regla general: ROCm N.x → usa la rueda rocmN.x más reciente
> que PyTorch ofrezca.

---

## 3. Docker GPU Passthrough Falla

**Síntomas:**
- El contenedor Docker no ve la GPU AMD
- `rocminfo` dentro del contenedor no muestra GPUs
- Error: "permission denied" al acceder a `/dev/kfd`

**Causas posibles:**
- Uso de `--gpus all` (sintaxis NVIDIA, no funciona en AMD)
- Faltan flags `--device` o `--group-add`
- El usuario no tiene permisos en el host

**Soluciones:**

```bash
# ✅ CORRECTO — Docker para AMD ROCm
docker run \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add=video \
  --group-add=render \
  --ipc=host \
  --shm-size=16g \
  -v /opt/rocm:/opt/rocm:ro \
  rocm/pytorch:latest

# ❌ INCORRECTO — Esto solo funciona en NVIDIA
# docker run --gpus all ...
```

Para verificar que el passthrough funciona:

```bash
# Dentro del contenedor:
docker exec -it <container> rocminfo | grep gfx
docker exec -it <container> python3 -c "import torch; print(torch.cuda.is_available())"
```

**docker-compose:**

```yaml
services:
  my-rocm-app:
    image: rocm/pytorch:latest
    devices:
      - /dev/kfd
      - /dev/dri
    group_add:
      - video
      - render
    ipc: host
    shm_size: 16g
    environment:
      - HIP_VISIBLE_DEVICES=0,1
      - ROCM_HOME=/opt/rocm
```

---

## 4. `HSA_OVERRIDE_GFX_VERSION` Causa Errores o Crashes

**Síntomas:**
- PyTorch se cuelga o crashea al crear tensores en GPU
- `torch.cuda.is_available()` es True pero las operaciones fallan
- Error: "HIP error: unknown error" o "invalid argument"

**Causas posibles:**
- El valor del override no coincide con ninguna arquitectura válida
- La aplicación espera instrucciones que la GPU no soporta realmente
- Override innecesario para la versión de ROCm instalada

**Soluciones:**

```bash
# 1. Eliminar el override completamente
unset HSA_OVERRIDE_GFX_VERSION

# 2. Si necesitas override, usar el valor correcto para tu GPU
# RX 7900 XTX (gfx1100) → export HSA_OVERRIDE_GFX_VERSION=11.0.0
# O probar con: export HSA_OVERRIDE_GFX_VERSION=10.3.0

# 3. Verificar la arquitectura real de tu GPU
rocminfo | grep gfx

# 4. Actualizar ROCm a una versión que soporte tu GPU nativamente
# En vez de usar override, instala ROCm 6.0+ para RDNA3
```

> **Regla de oro**: Si tu GPU está soportada oficialmente por la versión
> de ROCm que tienes instalada, **no uses** `HSA_OVERRIDE_GFX_VERSION`.
> El override es solo para GPUs muy nuevas o no listadas en la tabla
> de compatibilidad.

---

## 5. PyTorch Instala Rueda CUDA en Vez de ROCm

**Síntomas:**
- `pip install torch` instala una versión con "+cu121" o similar
- `torch.version.hip` es `None`
- La GPU AMD se detecta via `rocminfo` pero PyTorch no la usa

**Causa:**
Por defecto, PyTorch en PyPI distribuye ruedas CUDA.  En un sistema con
NVIDIA drivers instalados (incluso si la GPU es AMD), pip puede elegir
la rueda CUDA.  Además, si no se especifica `--index-url`, pip nunca
buscará las ruedas ROCm.

**Solución:**

```bash
# 1. Desinstalar PyTorch actual
pip uninstall torch torchvision torchaudio -y

# 2. Limpiar cache de pip
pip cache purge

# 3. Instalar desde el index ROCm explícitamente
pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/rocm6.2

# 4. Verificar
python3 -c "import torch; print(torch.__version__); print(torch.version.hip)"
# Debe mostrar: 2.x.x+rocm6.2 y 6.2.0
```

**Para proyectos con requirements.txt:**

```
# ❌ Incorrecto — instala rueda CUDA
torch>=2.0.0

# ✅ Correcto — pero solo funciona con --index-url
# En requirements.txt no se puede especificar index URL por paquete.
# Mejor usar un script de instalación:
```

```bash
# install.sh
pip install -r requirements.txt \
  --index-url https://download.pytorch.org/whl/rocm6.2
```

---

## 6. Permission Denied en `/dev/kfd` o `/dev/dri`

**Síntomas:**
- `rocminfo` falla con "Permission denied"
- Error al importar PyTorch: "could not open /dev/kfd"
- `ls -la /dev/kfd` muestra permisos restrictivos

**Causa:**
El usuario no pertenece a los grupos `video` o `render`, que son los que
tienen acceso a los dispositivos GPU.

**Solución:**

```bash
# 1. Verificar grupos actuales
groups $USER

# 2. Agregar usuario a los grupos necesarios
sudo usermod -a -G video,render $USER

# 3. Aplicar cambios en la sesión actual (sin cerrar sesión)
newgrp render

# 4. Verificar que ahora tienes acceso
ls -la /dev/kfd
# Debe mostrar: crw-rw---- 1 root render ...

# 5. Probar acceso
python3 -c "import torch; print(torch.cuda.is_available())"
```

> **Nota**: Si usas Docker, el contenedor debe correr con `--group-add=render`
> y `--group-add=video` para que el usuario dentro del contenedor tenga acceso.

---

## 7. ROCm Version Mismatch

**Síntomas:**
- Error al compilar kernels ROCm
- Advertencias de versión al iniciar PyTorch
- `rocminfo` muestra una versión pero PyTorch espera otra

**Causas posibles:**
- Se instaló ROCm 7.2.x pero PyTorch espera ROCm 6.1
- Múltiples versiones de ROCm instaladas (parcialmente)
- `LD_LIBRARY_PATH` apunta a la versión incorrecta

**Soluciones:**

```bash
# 1. Verificar versión instalada de ROCm
cat /opt/rocm/share/doc/rocm-version/version

# 2. Verificar versión que PyTorch espera
python3 -c "import torch; print(torch.version.hip)"

# 3. Si hay mismatch, reinstalar la versión correcta de PyTorch
# ROCm 7.2.x → usar rocm6.2 wheels
pip install torch --index-url https://download.pytorch.org/whl/rocm6.2

# 4. Si hay múltiples instalaciones, limpiar
sudo apt remove --purge rocm-* rocm-libs-* amdgpu-install
sudo rm -rf /opt/rocm*
sudo apt autoremove
# Luego reinstalar desde cero

# 5. Verificar LD_LIBRARY_PATH
echo $LD_LIBRARY_PATH
# Debe incluir /opt/rocm/lib
```

---

## 8. Variables de Entorno Faltantes o Incorrectas

**Síntomas:**
- La aplicación no ve todas las GPUs disponibles
- Error: "HIP_VISIBLE_DEVICES is set but no matching devices"
- Rendimiento subóptimo en modelos grandes

**Causas posibles:**
- `HIP_VISIBLE_DEVICES` o `ROCR_VISIBLE_DEVICES` no están configuradas
- Las variables apuntan a índices de GPU que no existen
- Confusión entre `CUDA_VISIBLE_DEVICES` y `HIP_VISIBLE_DEVICES`

**Soluciones:**

```bash
# 1. Verificar cuántas GPUs hay disponibles
rocm-smi --showproductname
# o
python3 -c "import torch; print(torch.cuda.device_count())"

# 2. Configurar variables correctas (en ~/.bashrc o entrypoint)
export HIP_VISIBLE_DEVICES=0,1,2,3    # Usa las primeras 4 GPUs
export ROCR_VISIBLE_DEVICES=0,1,2,3   # Alternativa (mismo efecto)

# 3. CUDA_VISIBLE_DEVICES también funciona en ROCm
export CUDA_VISIBLE_DEVICES=0,1       # Portátil entre NVIDIA y AMD

# 4. Optimizaciones adicionales para ROCm
export HIPBLAS_WORKSPACE_CONFIG=:512:8
export ROCM_HOME=/opt/rocm
export ROCM_PATH=/opt/rocm

# 5. Verificar que las variables surten efecto
python3 -c "
import os, torch
print('HIP_VISIBLE_DEVICES:', os.environ.get('HIP_VISIBLE_DEVICES', '(not set)'))
print('ROCR_VISIBLE_DEVICES:', os.environ.get('ROCR_VISIBLE_DEVICES', '(not set)'))
print('Devices visible to torch:', torch.cuda.device_count())
print('Device names:')
for i in range(torch.cuda.device_count()):
    print(f'  [{i}] {torch.cuda.get_device_name(i)}')
"
```

### Orden de Precedencia de Variables

Para AMD ROCm, las variables de selección de dispositivos se evalúan en
este orden:

1. `HIP_VISIBLE_DEVICES` (más específica de ROCm)
2. `ROCR_VISIBLE_DEVICES` (alternativa equivalente)
3. `CUDA_VISIBLE_DEVICES` (portátil, también funciona en ROCm)

Si ninguna está configurada, todas las GPUs detectadas son visibles.

---

## 9. Error "No ROCm GPU available" en vLLM

**Síntomas:**
- vLLM falla con "No ROCm GPU available"
- El contenedor Docker con vLLM no detecta GPUs AMD

**Causas posibles:**
- Se está usando la imagen incorrecta (vllm-openai en vez de vllm-openai-rocm)
- Falta `--group-add=render` en Docker
- Python version incorrecta (vLLM ROCm requiere Python 3.12)

**Soluciones:**

```bash
# 1. Usar la imagen ROCm correcta
docker pull vllm/vllm-openai-rocm:latest

# 2. Ejecutar con los flags correctos
docker run \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add=render \
  -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai-rocm:latest \
  --model mistralai/Mistral-7B-Instruct-v0.3

# 3. Verificar Python version dentro del contenedor
docker run --rm --device=/dev/kfd --device=/dev/dri \
  vllm/vllm-openai-rocm:latest python3 --version
# Debe ser 3.12.x
```

---

## 10. Error al Compilar Extensiones CUDA en ROCm

**Síntomas:**
- `pip install flash-attn` falla con errores de compilación
- Error: "nvcc not found" o "CUDA_HOME not set"
- `python setup.py install` para paquetes CUDA falla

**Causa:**
Muchas bibliotecas de PyTorch (como flash-attention) tienen código CUDA
nativo que no es compatible directamente con ROCm.  En AMD se necesita
un fork específico para ROCm.

**Solución:**

```bash
# flash-attention para ROCm
# Usar el fork de ROCm
git clone https://github.com/ROCm/flash-attention.git
cd flash-attention
pip install .

# Para otros paquetes con código CUDA:
# Buscar si existe una versión ROCm (ej: deepspeed → deepspeed-rocm)
# O usar la opción de hipificar: export HIPIFY=1
```

---

## Diagnóstico Rápido

Ejecuta esta secuencia para obtener toda la información de diagnóstico:

```bash
# 1. Información del sistema
echo "=== OS ===" && cat /etc/os-release | head -3
echo "=== Kernel ===" && uname -r

# 2. GPU detection
echo "=== PCI GPUs ===" && lspci | grep -iE "vga|3d|display"

# 3. ROCm tools
echo "=== ROCm ===" && command -v rocminfo && rocminfo | grep gfx
echo "=== rocm-smi ===" && rocm-smi --showproductname 2>/dev/null || echo "No rocm-smi"

# 4. NVIDIA fallback
echo "=== NVIDIA ===" && nvidia-smi 2>/dev/null || echo "No nvidia-smi"

# 5. PyTorch
echo "=== PyTorch ===" && python3 -c "
import torch
print(f'Torch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
print(f'HIP: {torch.version.hip}')
print(f'CUDA: {torch.version.cuda}')
if torch.cuda.is_available():
    for i in range(torch.cuda.device_count()):
        print(f'  [{i}] {torch.cuda.get_device_name(i)}')
"

# 6. Permisos
echo "=== Permisos ===" && ls -la /dev/kfd 2>/dev/null || echo "No /dev/kfd"
echo "=== Groups ===" && groups

# 7. Env vars
echo "=== Env ===" && env | grep -iE "hip|rocm|cuda|hsa" || echo "No ROCm/CUDA env vars set"
```

Si necesitas ayuda adicional, consulta la documentación oficial de ROCm:
- https://rocm.docs.amd.com/
- https://pytorch.org/docs/stable/notes/cuda.html
