# JS Instrumenter

### Dependencies
- Node JS 
```sh
cd ./src
npm i
```

### Running
```sh
node src/index.js prepare-dest <srcRoot> <dest>

node src/index.js instrument <srcRoot> <input> <dest> <destRoot>
```

### Communication
JS instrumented code sends data only via __http__ on localhost

### Files 
- .js
- .jsx
- .mjs
- .cjs
- .ts
- .tsx
- .mts
- .cts