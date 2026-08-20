import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finanzas 3.0',
    short_name: 'Finanzas',
    description: 'Centro privado de control y planificación financiera personal',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f7fa',
    theme_color: '#132b46',
    orientation: 'any',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
