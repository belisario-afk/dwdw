import type { VisualScene, VisualSceneName } from './types';

export async function loadScene(name: VisualSceneName): Promise<VisualScene> {
  switch (name) {
    case 'Particles': return (await import('./particles')).scene;
    case 'Fluid': return (await import('./fluid')).scene;
    case 'Tunnel': return (await import('./tunnel')).scene;
    case 'Terrain': return (await import('./terrain')).scene;
    case 'Typography': return (await import('./typography')).scene;
    default: return (await import('./particles')).scene;
  }
}