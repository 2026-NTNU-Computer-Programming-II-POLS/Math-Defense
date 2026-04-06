# Math Defense — WASM 編譯 Makefile
# 需要 Emscripten SDK (emsdk) 已安裝並啟動

CC = emcc
SRC = math_engine.c
OUT_DIR = ../frontend/public/wasm
OUT = $(OUT_DIR)/math_engine.js

EXPORTED_FUNCTIONS = '["_matrix_multiply","_calculate_trajectory","_sector_coverage","_point_in_sector","_numerical_integrate","_fourier_composite","_fourier_match","_line_circle_intersect","_malloc","_free"]'
EXPORTED_RUNTIME = '["ccall","cwrap","getValue","setValue"]'

FLAGS = -s EXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
        -s EXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME) \
        -s MODULARIZE=1 \
        -s EXPORT_ES6=1 \
        -s EXPORT_NAME='createMathEngine' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -O2

.PHONY: all clean

all: $(OUT)

$(OUT): $(SRC)
	$(CC) $(SRC) -o $(OUT) $(FLAGS)

clean:
	rm -f $(OUT_DIR)/math_engine.js $(OUT_DIR)/math_engine.wasm
