# Technology Stack: GodotCoder

## Environment
- **Node.js**: `>=22.19.0` (as defined in `package.json`)
- **Package Manager**: npm

## Languages & Compilers
- **TypeScript**: `5.9.3`
  - Targets ES Modules (`type: "module"` in `package.json`)
  - Configured via `tsconfig.json`

## Runtimes & Execution
- **Development Shell Runner**: `tsx` (TypeScript Execute)
- **Production CLI Entrypoint**: `./dist/cli.js`

## Commands and Scripts
- **Development**: `npm run dev` (runs `tsx src/cli.ts`)
- **Compilation**: `npm run build` (runs `tsc -p tsconfig.json`)
- **Type Checking (No Emit)**: `npm run check` (runs `tsc -p tsconfig.json --noEmit`)
- **Testing**: `npm run test:smoke` (runs Node.js native test runner on `test/*.test.mjs`)
