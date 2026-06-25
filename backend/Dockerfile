FROM node:20-alpine

WORKDIR /app

# Copy and build the MCP Server first
COPY custom-mcp-server ./custom-mcp-server
RUN cd custom-mcp-server && npm install && npm run build

# Copy and build the Backend
COPY backend ./backend
RUN cd backend && npm install && npm run build
# Copy non-TypeScript files
RUN mkdir -p backend/dist/db && cp backend/src/db/schema.sql backend/dist/db/schema.sql

# Start the backend
WORKDIR /app/backend
EXPOSE 3000
CMD ["npm", "start"]
