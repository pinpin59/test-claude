import { createServer } from 'node:http';

// FAILLE VOLONTAIRE (PR de test) : exécute une expression envoyée par l'utilisateur
export const calculatorServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const expression = url.searchParams.get('expr') ?? '0';
  const result: unknown = eval(expression);
  response.end(String(result));
});
