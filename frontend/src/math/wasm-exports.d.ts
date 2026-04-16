// AUTO-GENERATED from wasm/Makefile EXPORTED_FUNCTIONS. Do not edit — run `make` in wasm/ to regenerate.
// Note: _malloc and _free are exported for WASM heap management in WasmBridge
// but are NOT listed here because they are accessed as module._malloc/_free,
// not via ccall/cwrap.
export type WasmExport =
  | 'matrix_multiply'
  | 'calculate_trajectory'
  | 'sector_coverage'
  | 'point_in_sector'
  | 'numerical_integrate'
  | 'fourier_composite'
  | 'fourier_match'
  | 'line_circle_intersect'
;
