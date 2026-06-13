import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import React from 'react';

// Kiểu dáng tùy biến nổi trội hơn cho thông báo
const notificationStyles = {
  root: {
    border: '1.5px solid var(--notification-color)',
    borderRadius: '10px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
    paddingTop: '12px',
    paddingBottom: '12px',
    backdropFilter: 'blur(8px)',
  },
  title: {
    fontWeight: 700,
    fontSize: '14px',
  },
  description: {
    fontSize: '13px',
    fontWeight: 500,
    marginTop: '2px',
  },
};

export const showSuccessNotification = (message: string, title = 'Thành công') => {
  notifications.show({
    title,
    message,
    color: 'teal',
    icon: <IconCheck size={18} />,
    styles: notificationStyles,
  });
};

export const showErrorNotification = (message: string, title = 'Thất bại') => {
  notifications.show({
    title,
    message,
    color: 'red',
    icon: <IconX size={18} />,
    styles: notificationStyles,
  });
};

export const showWarningNotification = (message: string, title = 'Cảnh báo') => {
  notifications.show({
    title,
    message,
    color: 'orange',
    icon: <IconAlertTriangle size={18} />,
    styles: notificationStyles,
  });
};

export const showInfoNotification = (message: string, title = 'Thông tin') => {
  notifications.show({
    title,
    message,
    color: 'blue',
    icon: <IconInfoCircle size={18} />,
    styles: notificationStyles,
  });
};

export const showLoadingNotification = (id: string, message: string, title = 'Đang xử lý') => {
  notifications.show({
    id,
    title,
    message,
    loading: true,
    autoClose: false,
    withCloseButton: false,
    color: 'indigo',
    styles: notificationStyles,
  });
};

export const updateSuccessNotification = (id: string, message: string, title = 'Thành công') => {
  notifications.update({
    id,
    title,
    message,
    loading: false,
    autoClose: 3000,
    withCloseButton: true,
    color: 'teal',
    icon: <IconCheck size={18} />,
    styles: notificationStyles,
  });
};

export const updateErrorNotification = (id: string, message: string, title = 'Thất bại') => {
  notifications.update({
    id,
    title,
    message,
    loading: false,
    autoClose: 5000,
    withCloseButton: true,
    color: 'red',
    icon: <IconX size={18} />,
    styles: notificationStyles,
  });
};
