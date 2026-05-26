# Math Defense — WASM build Makefile
# Requires the Emscripten SDK (emsdk) to be installed and activated.

CC = emcc
# Anchor paths to the Makefile's own directory so `make -f path/to/Makefile`
# (without -C) writes to the correct frontend/src/math/wasm regardless of CWD.
# Artifacts live under src/ so Vite bundles them as proper module assets —
# dynamic imports of files in /public/ are rejected by newer Vite versions.
MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
# All translation units linked into the single math_engine.{js,wasm} pair.
# One linked binary is preferable to multiple modules: one .wasm download,
# shared RAII helper on the bridge side, one ABI surface.
SRC = $(MAKEFILE_DIR)math_engine.c \
      $(MAKEFILE_DIR)prng.c \
      $(MAKEFILE_DIR)curve.c \
      $(MAKEFILE_DIR)level_gen.c
OUT_DIR = $(MAKEFILE_DIR)../frontend/src/math/wasm
OUT = $(OUT_DIR)/math_engine.js
# Generated TypeScript declaration mirroring EXPORTED_FUNCTIONS. Keeps the
# WasmBridge name strings in lock-step with the C export list — a rename on
# one side is caught by vue-tsc instead of crashing at runtime.
DTS = $(MAKEFILE_DIR)../frontend/src/math/wasm-exports.d.ts

# Newer emcc requires either JSON-array or comma-separated list (no shell-quoted JSON).
# Comma-list form is portable across cmd / sh. Kept on one line because Make
# collapses backslash-continuations to a single space, and emcc's parser
# rejects spaces embedded inside the comma list.
EXPORTED_FUNCTIONS = _matrix_multiply,_sector_coverage,_point_in_sector,_numerical_integrate,_power_f64,_compute_total_score,_prng_seed,_prng_next_u32,_prng_next_f64,_curve_evaluate,_curve_derivative,_curve_in_domain,_find_pair_intersections,_find_all_curves_common_point,_count_common_intersections_in_interval,_compute_spawn_points,_generate_level,_malloc,_free
EXPORTED_RUNTIME = ccall,cwrap,getValue,setValue

# Determinism flags: forbid the compiler from rewriting transcendentals or
# fusing FMAs, both of which can yield engine-dependent ULP drift. With these
# in place, sinf/cosf/logf compile through musl in WASM bytecode and produce
# byte-identical output across every host that runs the .wasm.
FP_FLAGS = -fno-fast-math \
           -fno-unsafe-math-optimizations \
           -ffp-contract=off

FLAGS = -sEXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
        -sEXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME) \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME=createMathEngine \
        -sALLOW_MEMORY_GROWTH=1 \
        -sMAXIMUM_MEMORY=268435456 \
        $(FP_FLAGS) \
        -O2

.PHONY: all clean dts regenerate-fixtures

all: $(OUT) $(DTS)

# Refresh shared/score_parity_fixtures.json from the current Python mirror.
# Run after editing compute_total_score in any of {C, Python, TS}. Inputs are
# canonical and live inside scripts/regenerate_score_fixtures.py; this target
# just re-evaluates the `expected` column against the live formula.
regenerate-fixtures:
	cd $(MAKEFILE_DIR)../backend && python ../scripts/regenerate_score_fixtures.py

$(OUT): $(SRC)
	$(CC) $(SRC) -o $(OUT) $(FLAGS)

# Regenerate the .d.ts whenever the Makefile (source of truth for exports)
# changes. The sed pipeline strips the leading underscore that emcc requires
# on EXPORTED_FUNCTIONS and emits a TypeScript union-of-string-literals.
dts: $(DTS)

$(DTS): $(MAKEFILE_LIST)
	@mkdir -p $(dir $(DTS))
	@{ \
	  echo '// AUTO-GENERATED from wasm/Makefile EXPORTED_FUNCTIONS. Do not edit — run `make` in wasm/ to regenerate.'; \
	  echo '// Note: _malloc and _free are exported for WASM heap management in WasmBridge'; \
	  echo '// but are NOT listed here because they are accessed as module._malloc/_free,'; \
	  echo '// not via ccall/cwrap.'; \
	  printf 'export type WasmExport =\n'; \
	  echo "$(EXPORTED_FUNCTIONS)" | tr ',' '\n' | grep -v -E '^_(malloc|free)$$' | sed -e 's/^_//' -e "s/.*/  | '&'/"; \
	  echo ';'; \
	} > $(DTS)

clean:
	rm -f $(OUT_DIR)/math_engine.js $(OUT_DIR)/math_engine.wasm $(DTS)
