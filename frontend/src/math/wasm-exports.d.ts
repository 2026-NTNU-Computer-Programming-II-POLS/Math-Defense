// AUTO-GENERATED from wasm/Makefile EXPORTED_FUNCTIONS. Do not edit — run `make` in wasm/ to regenerate.
// Note: _malloc and _free are exported for WASM heap management in WasmBridge
// but are NOT listed here because they are accessed as module._malloc/_free,
// not via ccall/cwrap.
export type WasmExport =
  | 'matrix_multiply'
  | 'sector_coverage'
  | 'point_in_sector'
  | 'numerical_integrate'
  | 'power_f64'
  | 'prng_seed'
  | 'prng_next_u32'
  | 'prng_next_f64'
  | 'curve_evaluate'
  | 'curve_derivative'
  | 'curve_in_domain'
  | 'find_pair_intersections'
  | 'find_all_curves_common_point'
  | 'count_common_intersections_in_interval'
  | 'compute_spawn_points'
  | 'generate_level'
;
