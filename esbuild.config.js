const esbuild = require('esbuild');

const production = process.argv.includes('--production');

async function build() {
  const commonConfig = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    external: ['commander', 'glob'],
    sourcemap: !production,
    minify: production,
    minifyWhitespace: production,
    minifyIdentifiers: production,
    minifySyntax: production,
    treeShaking: true,
    legalComments: 'none',
    logLevel: 'info',
  };

  try {
    // Build CommonJS
    await esbuild.build({
      ...commonConfig,
      format: 'cjs',
      outfile: 'dist/index.js',
    });

    // Build ESM
    await esbuild.build({
      ...commonConfig,
      format: 'esm',
      outfile: 'dist/index.mjs',
    });

    // Build CLI
    await esbuild.build({
      ...commonConfig,
      entryPoints: ['src/cli.ts'],
      format: 'cjs',
      outfile: 'dist/cli.js',
    });

    console.log('✓ Build complete');
    
    // Generate TypeScript declarations using tsc
    const { execSync } = require('child_process');
    console.log('Generating TypeScript declarations...');
    execSync('tsc --emitDeclarationOnly --outDir dist', { stdio: 'inherit' });
    console.log('✓ TypeScript declarations generated');
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
