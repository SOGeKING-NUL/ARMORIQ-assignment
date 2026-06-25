import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, TextContent, Tool } from '@modelcontextprotocol/sdk/types.js';
import { storage, Runner, Marathon, Registration } from './storage.js';
import { toolSchemas } from './schemas.js';
import {
  ValidationError,
  validateEmail,
  validateDate,
  validateFutureDate,
  validateAge,
  validateDistance,
  validateUUID,
  validateStatus,
} from './validation.js';

const server = new Server({
  name: 'marathon-mcp',
  version: '1.0.0',
});

// Tool definitions
const tools: Tool[] = Object.values(toolSchemas).map((schema) => ({
  name: schema.name,
  description: schema.description,
  inputSchema: {
    type: "object",
    properties: schema.inputSchema.properties,
    required: schema.inputSchema.required,
  },
}));

// Register tools with server
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'create_marathon':
        return handleCreateMarathon(args);

      case 'list_marathons':
        return handleListMarathons();

      case 'get_runner_stats':
        return handleGetRunnerStats(args);

      case 'update_registration':
        return handleUpdateRegistration(args);

      case 'cancel_registration':
        return handleCancelRegistration(args);

      case 'register_runner_for_marathon':
        return handleRegisterRunnerForMarathon(args);

      case 'finish_marathon':
        return handleFinishMarathon(args);

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof ValidationError ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool handlers
function handleCreateMarathon(args: Record<string, unknown>) {
  const { name, date, distance = 42.195, location } = args;

  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Marathon name is required');
  }
  if (typeof date !== 'string' || !date.trim()) {
    throw new ValidationError('Marathon date is required');
  }
  if (typeof location !== 'string' || !location.trim()) {
    throw new ValidationError('Marathon location is required');
  }

  validateFutureDate(date);
  if (typeof distance === 'number') {
    validateDistance(distance);
  }

  const marathon = storage.createMarathon(name.trim(), date, distance as number, location.trim());

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(marathon, null, 2),
      },
    ],
  };
}

function handleListMarathons() {
  const marathons = storage.listMarathons();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(marathons, null, 2),
      },
    ],
  };
}

function handleGetRunnerStats(args: Record<string, unknown>) {
  const { runner_email } = args;

  if (typeof runner_email !== 'string' || !runner_email.trim()) {
    throw new ValidationError('runner_email is required');
  }

  validateEmail(runner_email);

  const runner = storage.getRunnerByEmail(runner_email);
  if (!runner) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Runner not found', email: runner_email }),
        },
      ],
    };
  }

  const registrations = storage.getRunnerRegistrations(runner.id);
  const marathonDetails = registrations.map((reg) => {
    const marathon = storage.getMarathon(reg.marathonId);
    return {
      registration: reg,
      marathon,
    };
  });

  const stats = {
    runner,
    marathonCount: registrations.length,
    completedCount: registrations.filter((r) => r.status === 'completed').length,
    registrations: marathonDetails,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(stats, null, 2),
      },
    ],
  };
}

function handleUpdateRegistration(args: Record<string, unknown>) {
  const { registration_id, new_status } = args;

  if (typeof registration_id !== 'string' || !registration_id.trim()) {
    throw new ValidationError('registration_id is required');
  }
  if (typeof new_status !== 'string' || !new_status.trim()) {
    throw new ValidationError('new_status is required');
  }

  validateUUID(registration_id);
  validateStatus(new_status);

  const updated = storage.updateRegistration(registration_id, new_status as any);
  if (!updated) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Registration not found', id: registration_id }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(updated, null, 2),
      },
    ],
  };
}

function handleCancelRegistration(args: Record<string, unknown>) {
  const { registration_id } = args;

  if (typeof registration_id !== 'string' || !registration_id.trim()) {
    throw new ValidationError('registration_id is required');
  }

  validateUUID(registration_id);

  const cancelled = storage.cancelRegistration(registration_id);
  if (!cancelled) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Registration not found', id: registration_id }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(cancelled, null, 2),
      },
    ],
  };
}

function handleRegisterRunnerForMarathon(args: Record<string, unknown>) {
  const { runner_email, runner_name, runner_age, marathon_name } = args;

  if (typeof runner_email !== 'string' || !runner_email.trim()) {
    throw new ValidationError('runner_email is required');
  }
  if (typeof marathon_name !== 'string' || !marathon_name.trim()) {
    throw new ValidationError('marathon_name is required');
  }

  validateEmail(runner_email);

  let runner = storage.getRunnerByEmail(runner_email);

  if (!runner) {
    if (typeof runner_name !== 'string' || !runner_name.trim()) {
      throw new ValidationError('runner_name is required for new runner');
    }
    if (typeof runner_age !== 'number') {
      throw new ValidationError('runner_age is required for new runner');
    }

    validateAge(runner_age);
    runner = storage.createRunner(runner_name.trim(), runner_email.trim(), runner_age);
  }

  const marathons = storage.listMarathons();
  const marathon = marathons.find(
    (m) => m.name.toLowerCase() === marathon_name.toLowerCase()
  );

  if (!marathon) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Marathon not found',
            requested: marathon_name,
            available: marathons.map((m) => m.name),
          }),
        },
      ],
      isError: true,
    };
  }

  const registration = storage.createRegistration(runner.id, marathon.id);
  if (!registration) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to register. Marathon may be full.',
            marathonId: marathon.id,
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            registration,
            runner,
            marathon: { id: marathon.id, name: marathon.name, date: marathon.date },
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleFinishMarathon(args: Record<string, unknown>) {
  const { runner_email, marathon_name } = args;

  if (typeof runner_email !== 'string' || !runner_email.trim()) {
    throw new ValidationError('runner_email is required');
  }
  if (typeof marathon_name !== 'string' || !marathon_name.trim()) {
    throw new ValidationError('marathon_name is required');
  }

  validateEmail(runner_email);

  const runner = storage.getRunnerByEmail(runner_email.trim());
  if (!runner) {
    throw new ValidationError(`Runner with email ${runner_email} not found`);
  }

  const marathons = storage.listMarathons();
  const marathon = marathons.find(
    (m) => m.name.toLowerCase() === marathon_name.trim().toLowerCase()
  );

  if (!marathon) {
    throw new ValidationError(`Marathon with name "${marathon_name}" not found`);
  }

  const registrations = storage.getRunnerRegistrations(runner.id);
  const registration = registrations.find(
    (r) => r.marathonId === marathon.id && r.status === 'registered'
  );

  if (!registration) {
    throw new ValidationError(`No active registration found for runner ${runner_email} in marathon "${marathon.name}"`);
  }

  const updated = storage.updateRegistration(registration.id, 'completed');
  if (!updated) {
    throw new ValidationError('Failed to update registration status');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            message: `Successfully completed ${marathon.name}! Stats updated.`,
            registration: updated,
            runner: storage.getRunner(runner.id),
          },
          null,
          2
        ),
      },
    ],
  };
}

// Initialize and run server
async function main() {
  // Seed with sample data
  storage.seedSampleData();

  // Set up tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Marathon MCP Server] Started on stdio transport');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
