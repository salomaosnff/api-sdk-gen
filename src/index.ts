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
  .requiredOption('-u, --url <url>', 'URL or file path of the OpenAPI JSON specification')
  .option('-b, --base <url>', 'Base URL for the API calls', 'http://localhost')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action(async (options) => {
    const config: Config = {
      url: options.url,
      api_base: options.base,
      outputDir: options.output,
    };

    try {
      let openapi: OpenAPIV3_1.Document;
      if (config.url.startsWith('http://') || config.url.startsWith('https://')) {
        console.log(`Fetching OpenAPI spec from: ${config.url}...`);
        const res = await fetch(config.url);
        if (!res.ok) {
          throw new Error(`Failed to fetch OpenAPI spec: ${res.statusText}`);
        }
        openapi = await res.json();
      } else {
        console.log(`Reading OpenAPI spec from file: ${config.url}...`);
        const content = await readFile(config.url, 'utf-8');
        openapi = JSON.parse(content);
      }

      console.log(`Generating SDK to: ${config.outputDir}...`);
      await mkdir(config.outputDir, { recursive: true });

      const project = new Project();
      const modelsFile = project.createSourceFile(join(config.outputDir, 'models.ts'), '', { overwrite: true });
      const apiFile = project.createSourceFile(join(config.outputDir, 'api.ts'), '', { overwrite: true });

      const templatePathCandidates = [
        join(__dirname, '../templates', 'core.ts'),
        join(__dirname, 'templates', 'core.ts'),
        join(process.cwd(), 'templates', 'core.ts'),
      ];
      let templateContent = '';
      for (const candidate of templatePathCandidates) {
        try {
          templateContent = await readFile(candidate, 'utf-8');
          break;
        } catch {
          // continue
        }
      }
      if (!templateContent) {
        throw new Error('Template core.ts not found');
      }

      const coreFile = project.createSourceFile(
        join(config.outputDir, 'core.ts'),
        templateContent,
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