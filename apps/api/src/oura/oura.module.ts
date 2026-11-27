import { Module } from '@nestjs/common';
import { OuraController } from './oura.controller.js';
import { OuraCoreModule } from './oura-core.module.js';

/** Oura in the API: the routes. (The worker runs the scheduled sync with OuraCoreModule.) */
@Module({ imports: [OuraCoreModule], controllers: [OuraController] })
export class OuraModule {}
