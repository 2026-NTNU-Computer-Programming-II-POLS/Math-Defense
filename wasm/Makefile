# Math Defense — WASM build Makefile
# Requires the Emscripten SDK (emsdk) to be installed and activated.

CC = emcc
# Anchor paths to the Makefile's own directory so `make -f path/to/Makefile`
# (without -C) writes to the correct frontend/public/wasm regardless of CWD.
MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
SRC = $(MAKEFILE_DIR)math_engine.c
OUT_DIR = $(MAKEFILE_DIR)../frontend/public/wasm
OUT = $(OUT_DIR)/math_engine.js
# Generated TypeScript declaration mirroring EXPORTED_FUNCTIONS. Keeps the
# WasmBridge name strings in lock-step with the C export list — a rename on
# one side is caught by vue-tsc instead of crashing at runtime.
DTS = $(MAKEFILE_DIR)../frontend/src/math/wasm-exports.d.ts

# Newer emcc requires either JSON-array or comma-separated list (no shell-quoted JSON).
# Comma-list form is portable across cmd / sh.
# calculate_trajectory and line_circle_intersect are kept for the trajectory-preview /
# line-circle hit-detection paths that WasmBridge now wraps below.
EXPORTED_FUNCTIONS = _matrix_multiply,_calculate_trajectory,_sector_coverage,_point_in_sector,_numerical_integrate,_fourier_composite,_fourier_match,_line_circle_intersect,_malloc,_free
EXPORTED_RUNTIME = ccall,cwrap,getValue,setValue

FLAGS = -sEXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
        -sEXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME) \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME=createMathEngine \
        -sALLOW_MEMORY_GROWTH=1 \
        -O2

.PHONY: all clean dts

all: $(OUT) $(DTS)

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
	  printf 'export type WasmExport =\n'; \
	  echo "$(EXPORTED_FUNCTIONS)" | tr ',' '\n' | sed -e 's/^_//' -e "s/.*/  | '&'/"; \
	  echo ';'; \
	} > $(DTS)

clean:
	rm -f $(OUT_DIR)/math_engine.js $(OUT_DIR)/math_engine.wasm $(DTS)
