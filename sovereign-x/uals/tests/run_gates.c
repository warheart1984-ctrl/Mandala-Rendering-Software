#include <stdio.h>
#include <string.h>
#include "axiom/uals.h"

extern int gate_probe(const uals_device **devices, uint32_t *count);
extern int gate_dispatch(const uals_device *dev);
extern int gate_determinism(const uals_device *dev);
extern int gate_provenance(const uals_device *dev);
extern int gate_registry(const uals_device *dev);
extern int gate_parity(const uals_device *dev);
extern int gate_integrator(const uals_device *dev);

int main(void) {
  printf("uals gate harness (ABI v%d)\n", UALS_ABI_VERSION);
  const uals_device *devices = NULL;
  uint32_t count = 0;

  printf("[G2] probe\n");
  int ok = gate_probe(&devices, &count);
  printf("[G2] %s\n", ok ? "PASS" : "FAIL");

  int all = ok;
  if (ok) {
    const uals_device *dev = &devices[0];
    printf("[G3] dispatch\n");
    int g3 = gate_dispatch(dev);
    printf("[G3] %s\n", g3 ? "PASS" : "FAIL");
    all = all && g3;

    printf("[G4] determinism\n");
    int g4 = gate_determinism(dev);
    printf("[G4] %s\n", g4 ? "PASS" : "FAIL");
    all = all && g4;

    printf("[G5] provenance\n");
    int g5 = gate_provenance(dev);
    printf("[G5] %s\n", g5 ? "PASS" : "FAIL");
    all = all && g5;

    printf("[G6] parity vs C reference\n");
    int g6 = gate_parity(dev);
    printf("[G6] %s\n", g6 ? "PASS" : "FAIL");
    all = all && g6;

    printf("[G7] registry deny\n");
    int g7 = gate_registry(dev);
    printf("[G7] %s\n", g7 ? "PASS" : "FAIL");
    all = all && g7;

    printf("[G8] integrator parity vs C reference\n");
    int g8 = gate_integrator(dev);
    printf("[G8] %s\n", g8 ? "PASS" : "FAIL");
    all = all && g8;
  } else {
    printf("[G3-G8] SKIPPED (no device)\n");
  }

  printf("G1: header + sources compiled clean (/W4) by build step\n");
  printf(all ? "ALL GATES PASS\n" : "GATES FAILED\n");
  return all ? 0 : 1;
}