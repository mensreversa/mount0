import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/blog',
    component: ComponentCreator('/blog', 'b55'),
    exact: true
  },
  {
    path: '/blog/archive',
    component: ComponentCreator('/blog/archive', '182'),
    exact: true
  },
  {
    path: '/blog/authors',
    component: ComponentCreator('/blog/authors', '0b7'),
    exact: true
  },
  {
    path: '/blog/storage-for-the-future',
    component: ComponentCreator('/blog/storage-for-the-future', '835'),
    exact: true
  },
  {
    path: '/blog/tags',
    component: ComponentCreator('/blog/tags', '287'),
    exact: true
  },
  {
    path: '/blog/tags/cloud',
    component: ComponentCreator('/blog/tags/cloud', 'f43'),
    exact: true
  },
  {
    path: '/blog/tags/infrastructure',
    component: ComponentCreator('/blog/tags/infrastructure', '9d8'),
    exact: true
  },
  {
    path: '/blog/tags/storage',
    component: ComponentCreator('/blog/tags/storage', 'bba'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '960'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '026'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '2d1'),
            routes: [
              {
                path: '/architecture',
                component: ComponentCreator('/architecture', 'c5a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/types/',
                component: ComponentCreator('/types/', '349'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/classes/Mount0',
                component: ComponentCreator('/types/classes/Mount0', '257'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/functions/mount0',
                component: ComponentCreator('/types/functions/mount0', 'ffb'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/DirEntry',
                component: ComponentCreator('/types/interfaces/DirEntry', 'e34'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/FileHandle',
                component: ComponentCreator('/types/interfaces/FileHandle', '02b'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/FileStat',
                component: ComponentCreator('/types/interfaces/FileStat', '151'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/FilesystemProvider',
                component: ComponentCreator('/types/interfaces/FilesystemProvider', 'df3'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/Flock',
                component: ComponentCreator('/types/interfaces/Flock', '33b'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/MountOptions',
                component: ComponentCreator('/types/interfaces/MountOptions', 'cce'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/types/interfaces/Statfs',
                component: ComponentCreator('/types/interfaces/Statfs', '3cc'),
                exact: true,
                sidebar: "apiSidebar"
              },
              {
                path: '/usage',
                component: ComponentCreator('/usage', '8ee'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/',
                component: ComponentCreator('/', 'fc9'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
