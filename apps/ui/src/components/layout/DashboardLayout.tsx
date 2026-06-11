import './Navbar.css';
import { AppShell, Group, NavLink, Stack, Title, Burger, Tooltip, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSwords, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { navigationConfig } from '@/configs/routes.config';

const navbarCollapsedStorageKey = 'jx-manager-navbar-collapsed';

function readDesktopNavbarOpened() {
  try {
    return window.localStorage.getItem(navbarCollapsedStorageKey) !== 'true';
  } catch {
    return true;
  }
}

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, setDesktopOpened] = useState(readDesktopNavbarOpened);

  const toggleDesktop = useCallback(() => {
    setDesktopOpened((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(navbarCollapsedStorageKey, String(!next));
      } catch {
        // Ignore storage failures and keep the in-memory toggle usable.
      }
      return next;
    });
  }, []);

  const getActiveKey = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) {
      return 'dashboard';
    }
    if (path.startsWith('/game-accounts')) {
      return 'game-accounts';
    }
    if (path.startsWith('/backup')) {
      return 'backup';
    }
    if (path.startsWith('/settings')) {
      return 'settings';
    }
    return 'dashboard';
  };

  const activeKey = getActiveKey();

  return (
    <AppShell
      layout="alt"
      header={{ height: 60 }}
      navbar={{
        width: desktopOpened ? 240 : 80,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header px="md" style={{ display: 'flex', alignItems: 'center' }}>
        <Group h="100%" justify="space-between" style={{ flex: 1, flexWrap: 'nowrap' }}>
          <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <IconSwords size={26} color="var(--mantine-color-blue-7)" />
            <Title order={3} style={{ fontFamily: 'var(--mantine-font-family)' }}>
              JX Manager
            </Title>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="navbarColored">
        <Stack gap="md" style={{ height: '100%' }}>
          {/* Toggle Area of Navbar */}
          <Group
            justify={desktopOpened ? 'flex-end' : 'center'}
            style={{ width: '100%', paddingBottom: '10px' }}
          >
            <ActionIcon
              className="navbarToggleBtn"
              aria-label={desktopOpened ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
              onClick={toggleDesktop}
              visibleFrom="sm"
              size="lg"
            >
              {desktopOpened ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />}
            </ActionIcon>
          </Group>

          {/* Navigation Links */}
          <Stack gap="xs" style={{ flex: 1 }}>
            {navigationConfig.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;
              const navLink = (
                <NavLink
                  key={item.key}
                  label={desktopOpened ? item.title : ''}
                  leftSection={<Icon size={20} />}
                  active={isActive}
                  onClick={() => {
                    navigate(item.path);
                    if (mobileOpened) {
                      toggleMobile();
                    }
                  }}
                  className={`navLinkColored ${isActive ? 'navLinkColoredActive' : ''} ${
                    !desktopOpened ? 'navLinkCollapsed' : ''
                  }`}
                />
              );

              return desktopOpened ? (
                navLink
              ) : (
                <Tooltip key={item.key} label={item.title} position="right" withArrow>
                  <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    {navLink}
                  </div>
                </Tooltip>
              );
            })}
          </Stack>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-gray-0)">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
