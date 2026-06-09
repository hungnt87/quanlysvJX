import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RestoreModal } from './RestoreModal';

function renderModal() {
  const onConfirm = vi.fn();
  render(
    <MantineProvider>
      <RestoreModal
        opened
        kind="mysql"
        filename="mysql-20260609-030405.sql.gz"
        loading={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    </MantineProvider>
  );
  return { onConfirm };
}

describe('RestoreModal', () => {
  it('requires typing the exact filename before restore', () => {
    const { onConfirm } = renderModal();
    const restoreButton = screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement;

    expect(restoreButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Backup filename'), {
      target: { value: 'mysql-20260609-030405.sql.gz' }
    });
    fireEvent.click(restoreButton);

    expect(restoreButton.disabled).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
