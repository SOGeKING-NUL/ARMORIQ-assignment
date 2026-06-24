export const toolSchemas = {
  create_marathon: {
    name: 'create_marathon',
    description: 'Register a new marathon event',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Marathon event name (e.g., "NYC Marathon")',
        },
        date: {
          type: 'string',
          description: 'Marathon date in YYYY-MM-DD format',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        distance: {
          type: 'number',
          description: 'Marathon distance in kilometers (default: 42.195)',
          minimum: 0,
        },
        location: {
          type: 'string',
          description: 'Marathon location (city, country)',
        },
      },
      required: ['name', 'date', 'location'],
    },
  },

  list_marathons: {
    name: 'list_marathons',
    description: 'Get all registered marathons, sorted by date',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  get_runner_stats: {
    name: 'get_runner_stats',
    description: 'Get a runner\'s participation statistics and registration history',
    inputSchema: {
      type: 'object',
      properties: {
        runner_email: {
          type: 'string',
          description: 'Runner\'s email address',
        },
      },
      required: ['runner_email'],
    },
  },

  update_registration: {
    name: 'update_registration',
    description: 'Update a registration status (e.g., mark as completed)',
    inputSchema: {
      type: 'object',
      properties: {
        registration_id: {
          type: 'string',
          description: 'Registration ID (UUID)',
        },
        new_status: {
          type: 'string',
          enum: ['registered', 'completed', 'cancelled'],
          description: 'New registration status',
        },
      },
      required: ['registration_id', 'new_status'],
    },
  },

  cancel_registration: {
    name: 'cancel_registration',
    description: 'Cancel a marathon registration',
    inputSchema: {
      type: 'object',
      properties: {
        registration_id: {
          type: 'string',
          description: 'Registration ID (UUID)',
        },
      },
      required: ['registration_id'],
    },
  },

  register_runner_for_marathon: {
    name: 'register_runner_for_marathon',
    description: 'Register a runner for a specific marathon',
    inputSchema: {
      type: 'object',
      properties: {
        runner_email: {
          type: 'string',
          description: 'Runner\'s email address (creates runner if not exists)',
        },
        runner_name: {
          type: 'string',
          description: 'Runner\'s full name (required if runner is new)',
        },
        runner_age: {
          type: 'number',
          description: 'Runner\'s age (required if runner is new)',
          minimum: 1,
        },
        marathon_name: {
          type: 'string',
          description: 'Marathon event name to register for',
        },
      },
      required: ['runner_email', 'marathon_name'],
    },
  },
};
