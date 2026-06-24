# Marathon MCP Server

A Model Context Protocol (MCP) server that exposes marathon registration and management tools.

## Tools

1. **create_marathon** - Register a new marathon event
   - Input: `name`, `date` (YYYY-MM-DD), `distance` (km), `location`
   - Output: Marathon object with ID, registration count, etc.

2. **list_marathons** - Get all registered marathons (sorted by date)
   - Input: None
   - Output: Array of Marathon objects

3. **get_runner_stats** - Get a runner's participation history and statistics
   - Input: `runner_email`
   - Output: Runner details, marathons completed, registrations, etc.

4. **register_runner_for_marathon** - Register a runner for a marathon
   - Input: `runner_email`, `marathon_name`, optional: `runner_name`, `runner_age`
   - Output: Registration confirmation with runner and marathon details

5. **update_registration** - Update a registration status
   - Input: `registration_id`, `new_status` (registered|completed|cancelled)
   - Output: Updated registration object

6. **cancel_registration** - Cancel a marathon registration
   - Input: `registration_id`
   - Output: Cancelled registration object

## Setup

```bash
npm install
npm run build
```

## Running the Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

The server communicates via stdio (standard input/output) transport, making it easy to spawn as a child process from the backend agent.

## Data Structures

### Marathon
```typescript
{
  id: string (UUID)
  name: string
  date: string (YYYY-MM-DD)
  distance: number (km)
  location: string
  maxParticipants: number
  registeredCount: number
  createdAt: string (ISO 8601)
}
```

### Runner
```typescript
{
  id: string (UUID)
  name: string
  email: string
  age: number
  marathonsCompleted: number
  totalDistance: number (km)
  createdAt: string (ISO 8601)
}
```

### Registration
```typescript
{
  id: string (UUID)
  runnerId: string
  marathonId: string
  status: 'registered' | 'completed' | 'cancelled'
  registeredAt: string (ISO 8601)
  completedAt?: string (ISO 8601)
}
```

## Testing

Unit tests for the storage layer:

```bash
npm test
```

Tests cover:
- Marathon CRUD operations
- Runner management
- Registration lifecycle
- Status transitions
- Sample data seeding

## Integration with Backend

The backend connects to this server via stdio transport:

```javascript
const client = new MCPClient('marathon', {
  command: 'node',
  args: ['dist/index.js'],
  cwd: './custom-mcp-server'
});
```

Tool discovery is automatic — the backend queries the server for available tools.
