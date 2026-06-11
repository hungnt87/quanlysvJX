import { IconGauge, IconUser, IconCloudDownload, IconSettings } from '@tabler/icons-react';
import { lazy } from 'react';

export interface NavigationTree {
  key: string;
  path: string;
  title: string;
  icon: React.ComponentType<any>;
  type: 'item' | 'collapse' | 'title';
  subMenu?: NavigationTree[];
}

export interface RouteConfig {
  key: string;
  path: string;
  component: React.ComponentType<any>;
  title: string;
  icon: React.ComponentType<any>;
}

export const routes: RouteConfig[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    component: lazy(() => import('@/views/dashboard')),
    title: 'Bảng điều khiển',
    icon: IconGauge,
  },
  {
    key: 'game-accounts',
    path: '/game-accounts',
    component: lazy(() => import('@/views/game-accounts')),
    title: 'Tài khoản',
    icon: IconUser,
  },
  {
    key: 'backup',
    path: '/backup/*',
    component: lazy(() => import('@/views/backup')),
    title: 'Sao lưu',
    icon: IconCloudDownload,
  },
  {
    key: 'settings',
    path: '/settings',
    component: lazy(() => import('@/views/settings')),
    title: 'Cài đặt',
    icon: IconSettings,
  },
];

export const navigationConfig: NavigationTree[] = routes.map((route) => ({
  key: route.key,
  path: route.path.replace('/*', ''),
  title: route.title,
  icon: route.icon,
  type: 'item',
}));
