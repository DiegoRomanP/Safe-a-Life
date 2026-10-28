import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitepress';

// Lista los .md de una carpeta de docs/ como entradas de la barra lateral.
const entries = (dir: string, label = (name: string) => name) =>
  readdirSync(new URL(`../${dir}/`, import.meta.url))
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ text: label(file.replace(/\.md$/, '')), link: `/${dir}/${file.replace(/\.md$/, '')}` }));

export default defineConfig({
  lang: 'es',
  title: 'Save a Life',
  description: 'Documentación oficial del prototipo académico Save a Life',
  cleanUrls: true,
  // El índice de la carpeta es README.md (lo leen GitHub y los agentes); en el sitio es la portada.
  rewrites: { 'README.md': 'index.md' },
  lastUpdated: true,
  // docs/ también aloja archivos que no son del sitio (OpenAPI, bitácoras de agentes).
  srcExclude: ['**/node_modules/**'],
  // Enlaces a archivos del repositorio fuera de docs/ (código, evidence_pc2/, .opencode/).
  ignoreDeadLinks: [/^\.\.\//, /^\.\/\.\.\//, /localhost/, /^\/?\.opencode/],
  themeConfig: {
    nav: [
      { text: 'Inicio', link: '/' },
      { text: 'Producto', link: '/1_Primeros_Alcances' },
      { text: 'Arquitectura', link: '/decisions/ADR-001-stack-del-prototipo' },
      { text: 'API', link: '/Api-Rules' },
      { text: 'Frontend', link: '/Frontend-Handoff' },
      { text: 'Planes', link: '/plans/HISTORIAL' },
    ],
    sidebar: [
      { text: 'Índice de documentación', link: '/' },
      {
        text: '1. Producto y requisitos',
        items: [
          { text: 'Primeros alcances', link: '/1_Primeros_Alcances' },
          { text: 'Especificación de software (ERS)', link: '/2_Especificaciones_De_Software' },
        ],
      },
      { text: '2. Decisiones de arquitectura', collapsed: true, items: entries('decisions') },
      {
        text: '3. Contrato de API',
        items: [
          { text: 'Reglas de API', link: '/Api-Rules' },
          { text: 'Contratos backend', link: '/Backend-Contracts' },
          { text: 'Necesidad en borrador', link: '/Need-Draft-Application-Spec' },
        ],
      },
      {
        text: '5. Frontend',
        items: [
          { text: 'Entrega frontend', link: '/Frontend-Handoff' },
          { text: 'Diseño de interfaz', link: '/Frontend-Design' },
        ],
      },
      {
        text: '6. Proceso y agentes',
        items: [
          { text: 'Flujo de trabajo de agentes', link: '/Agent-Workflow' },
          { text: 'Identidad de Engram', link: '/Memory-Project' },
        ],
      },
      { text: 'Planes (backend, frontend y proceso)', collapsed: true, items: entries('plans') },
      { text: 'Pendientes', collapsed: true, items: entries('pending') },
    ],
    outline: { level: [2, 3], label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    lastUpdated: { text: 'Actualizado' },
    returnToTopLabel: 'Volver arriba',
    sidebarMenuLabel: 'Menú',
    darkModeSwitchLabel: 'Tema',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
          modal: {
            noResultsText: 'Sin resultados para',
            resetButtonTitle: 'Limpiar',
            footer: { selectText: 'Seleccionar', navigateText: 'Navegar', closeText: 'Cerrar' },
          },
        },
      },
    },
  },
});
