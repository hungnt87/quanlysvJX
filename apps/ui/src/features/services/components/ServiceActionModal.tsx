import { Button, Group, Modal, Text } from '@mantine/core';

type Props = {
  opened: boolean;
  service: string | null;
  action: 'stop' | 'restart' | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ServiceActionModal({ opened, service, action, loading, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Confirm service action" centered>
      <Text mb="md">
        Confirm {action} for service <strong>{service}</strong>.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button color="red" loading={loading} onClick={onConfirm}>Confirm</Button>
      </Group>
    </Modal>
  );
}
