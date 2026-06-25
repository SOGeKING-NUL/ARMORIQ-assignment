import '../styles/ToolCatalog.css';

interface Tool {
  name: string;
  description: string;
  server: string;
  inputSchema?: any;
}

interface ToolCatalogProps {
  tools: Tool[];
}

export default function ToolCatalog({ tools }: ToolCatalogProps) {
  const groupedByServer = tools.reduce(
    (acc, tool) => {
      if (!acc[tool.server]) {
        acc[tool.server] = [];
      }
      acc[tool.server].push(tool);
      return acc;
    },
    {} as Record<string, Tool[]>
  );

  return (
    <div className="tool-catalog">
      <div className="catalog-header">
        <h2>Tool Discovery</h2>
        <span className="tool-count">Total Tools: {tools.length}</span>
      </div>

      {tools.length === 0 ? (
        <p className="empty-state">No tools discovered. Check your MCP servers.</p>
      ) : (
        Object.entries(groupedByServer).map(([server, serverTools]) => (
          <div key={server} className="server-group">
            <h3 className="server-name">{server}</h3>
            <div className="tools-grid">
              {serverTools.map((tool) => (
                <div key={tool.name} className="tool-card">
                  <h4>{tool.name}</h4>
                  <p className="tool-desc">{tool.description || 'No description'}</p>
                  {tool.inputSchema && (
                    <details>
                      <summary>Schema</summary>
                      <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
