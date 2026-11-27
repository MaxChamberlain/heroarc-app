import { Module } from '@nestjs/common';
import { LayoutModule } from '../layout/layout.module.js';
import { ActivityController } from './activity.controller.js';
import { AgentService } from './agent.service.js';
import { AgentApiController } from './agent-api.controller.js';
import { HermesController } from './hermes.controller.js';
import { McpController } from './mcp.controller.js';

/** The agent tool registry and action log (Coach), and the APIs outside agents call: REST tools, MCP and the original Hermes API. */
@Module({
  imports: [LayoutModule],
  controllers: [AgentApiController, HermesController, McpController, ActivityController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
