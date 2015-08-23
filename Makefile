BUILD_DIR = build
SRC_DIR = src

JS = $(shell find $(SRC_DIR) -name "*.js")

COMPILED_JS = $(BUILD_DIR)/leopold.js

all: build

$(COMPILED_JS): $(JS)
	echo recompiling js
	@mkdir -p $(BUILD_DIR)
	@export NODE_PATH=$(NODE_PATH):$(SRC_DIR); \
		./node_modules/.bin/browserify \
			--outfile $(COMPILED_JS) \
			--standalone leopold \
			--transform babelify \
			--paths ./$(SRC_DIR) \
			--debug

build: node_modules $(COMPILED_JS)

watch:
	watch -i 3 make build

node_modules: package.json
	npm install --quiet 
	npm prune

clean:
	rm -rf $(BUILD_DIR)
	mkdir $(BUILD_DIR)

test:
	./node_modules/.bin/babel-tape-runner ./test/**/*-spec.js | ./node_modules/.bin/faucet

browser:
	./node_modules/.bin/browserify \
		--transform [babelify --blacklist regenerator ] \
		--debug ./test/*.js \
		| ./node_modules/.bin/browser-run -p 2222  \
		| ./node_modules/.bin/faucet



.PHONY: build watch clean test browser
