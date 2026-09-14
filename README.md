## CP Walking skeleton

GET /api/agents
-> db dotaz pro získání všech agentů


POST /api/reservations/
-> validace že agent existuje a je volný
-> ověření jestli uživatel má nárok na rezervaci agenta
-> rezervace jednoho agenta
-> return id rezervovaného agenta

