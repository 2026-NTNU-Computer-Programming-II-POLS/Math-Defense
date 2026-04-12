# Math Defense — WASM build Makefile
# Requires the Emscripten SDK (emsdk) to be installed and activated.

CC = emcc
# Anchor paths to the Makefile's own directory so `make -f path/to/Makefile`
# (without -C) writes to the correct frontend/public/wasm regardless of CWD.
MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
SRC = $(MAKEFILE_DIR)math_engine.c
OUT_DIR = $(MAKEFILE_DIR)../frontend/public/wasm
OUT = $(OUT_DIR)/math_engine.js

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

.PHONY: all clean

all: $(OUT)

$(OUT): $(SRC)
	$(CC) $(SRC) -o $(OUT) $(FLAGS)

clean:
	rm -f $(OUT_DIR)/math_engine.js $(OUT_DIR)/math_engine.wasm
