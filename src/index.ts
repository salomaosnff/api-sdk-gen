#!/usr/bin/env node
import { Config } from './types/config';
import { OpenAPIV3_1 } from 'openapi-types';
import { generateModels } from './generators/typescript/models_generator';
import { mkdir, readFile } from 'node:fs/promises';
import { Project } from 'ts-morph';
import { join } from 'node:path';
import { generateApiType } from './generators/typescript/api_generator';
import { Command } from 'commander';

const program = new Command();

program
  .name('api-sdk-gen')
  .description('Generate TypeScript SDK from OpenAPI specification')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'URL of the OpenAPI JSON specification')
  .requiredOption('-b, --base <url>', 'Base URL for the API calls')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action(async (options) => {
    const config: Config = {
      url: options.url,
      api_base: options.base,
      outputDir: options.output,
    };

    try {
      console.log(`Fetching OpenAPI spec from: ${config.url}...`);
      const res = await fetch(config.url);
      if (!res.ok) {
        throw new Error(`Failed to fetch OpenAPI spec: ${res.statusText}`);
      }
      const openapi: OpenAPIV3_1.Document = await res.json();

      console.log(`Generating SDK to: ${config.outputDir}...`);
      await mkdir(config.outputDir, { recursive: true });

      const project = new Project();
      const modelsFile = project.createSourceFile(join(config.outputDir, 'models.ts'), '', { overwrite: true });
      const apiFile = project.createSourceFile(join(config.outputDir, 'api.ts'), '', { overwrite: true });

      const templatePath = join(__dirname, '../templates', 'core.ts');
      const coreFile = project.createSourceFile(
        join(config.outputDir, 'core.ts'),
        await readFile(templatePath, 'utf-8'),
        { overwrite: true }
      );

      await generateModels(modelsFile, config, openapi);
      await generateApiType(apiFile, config, openapi);

      await project.save();
      console.log('SDK generated successfully!');
    } catch (error) {
      console.error('Error generating SDK:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();