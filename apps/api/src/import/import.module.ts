import { Module } from '@nestjs/common';
import { ImportController } from './import.controller.js';
import { LegacyImportService } from './legacy-import.service.js';

/** Importing the original HeroArc's Google Sheet. */
@Module({ controllers: [ImportController], providers: [LegacyImportService] })
export class ImportModule {}
