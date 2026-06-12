import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { useBackups } from '@/hooks/useBackups';
import type { ScheduledBackupJob, BackupKind } from '@/services/types';
import { ModalTitle } from '@/components/common/ModalTitle';

type Props = {
  opened: boolean;
  job: ScheduledBackupJob | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const dayOptions = [
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
  { value: '0', label: 'Chủ Nhật' },
];

export function ScheduledJobModal({ opened, job, onClose, onSuccess, onError }: Props) {
  const { createScheduledJob, updateScheduledJob, isActionLoading } = useBackups();

  const form = useForm({
    initialValues: {
      database: 'mysql' as BackupKind,
      enabled: true,
      scheduleType: 'hourly' as 'hourly' | 'daily' | 'weekly',
      everyHours: 2,
      minute: 0,
      time: '03:00',
      daysOfWeek: [] as string[],
    },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.scheduleType === 'hourly') {
        if (!values.everyHours || values.everyHours < 1 || values.everyHours > 23) {
          errors.everyHours = 'Tần suất giờ phải từ 1 đến 23 giờ';
        }
        if (values.minute === undefined || values.minute < 0 || values.minute > 59) {
          errors.minute = 'Phút phải từ 0 đến 59';
        }
      }
      if (values.scheduleType === 'daily') {
        if (!values.time) {
          errors.time = 'Thời gian chạy hàng ngày là bắt buộc';
        }
      }
      if (values.scheduleType === 'weekly') {
        if (!values.time) {
          errors.time = 'Thời gian chạy hàng tuần là bắt buộc';
        }
        if (!values.daysOfWeek || values.daysOfWeek.length === 0) {
          errors.daysOfWeek = 'Vui lòng chọn ít nhất một ngày trong tuần';
        }
      }
      return errors;
    },
  });

  useEffect(() => {
    if (opened) {
      if (job) {
        form.setValues({
          database: job.database,
          enabled: job.enabled,
          scheduleType: job.schedule.type,
          everyHours: job.schedule.type === 'hourly' ? job.schedule.everyHours : 2,
          minute: job.schedule.type === 'hourly' ? job.schedule.minute : 0,
          time: job.schedule.type !== 'hourly' ? job.schedule.time : '03:00',
          daysOfWeek: job.schedule.type === 'weekly' ? job.schedule.daysOfWeek.map(String) : [],
        });
      } else {
        form.reset();
      }
    }
  }, [opened, job]);

  const handleSubmit = (values: typeof form.values) => {
    let schedule: any;
    if (values.scheduleType === 'hourly') {
      schedule = {
        type: 'hourly',
        everyHours: values.everyHours,
        minute: values.minute,
      };
    } else if (values.scheduleType === 'daily') {
      schedule = {
        type: 'daily',
        time: values.time,
      };
    } else {
      schedule = {
        type: 'weekly',
        daysOfWeek: values.daysOfWeek.map(Number),
        time: values.time,
      };
    }

    const payload = {
      database: values.database,
      enabled: values.enabled,
      schedule,
    };

    if (job) {
      updateScheduledJob({ id: job.id, payload })
        .then(() => {
          onSuccess('Đã cập nhật lịch sao lưu thành công');
          onClose();
        })
        .catch((err) => {
          onError(err instanceof Error ? err.message : 'Không thể cập nhật lịch sao lưu');
        });
    } else {
      createScheduledJob(payload)
        .then(() => {
          onSuccess('Đã tạo lịch sao lưu thành công');
          onClose();
        })
        .catch((err) => {
          onError(err instanceof Error ? err.message : 'Không thể tạo lịch sao lưu');
        });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={isActionLoading ? () => undefined : onClose}
      title={
        <ModalTitle
          title={job ? 'Sửa lịch hẹn giờ' : 'Thêm lịch hẹn giờ mới'}
          subtitle="Thiết lập thời gian tự động sao lưu dữ liệu"
        />
      }
      centered
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <Select
            label="Database"
            data={[
              { value: 'mysql', label: 'MySQL' },
              { value: 'mssql', label: 'MSSQL' },
            ]}
            disabled={isActionLoading || job !== null}
            {...form.getInputProps('database')}
          />

          <Select
            label="Kiểu lịch"
            data={[
              { value: 'hourly', label: 'Hàng giờ (Hourly)' },
              { value: 'daily', label: 'Hàng ngày (Daily)' },
              { value: 'weekly', label: 'Hàng tuần (Weekly)' },
            ]}
            disabled={isActionLoading}
            {...form.getInputProps('scheduleType')}
          />

          {form.values.scheduleType === 'hourly' && (
            <Group grow>
              <NumberInput
                label="Mỗi bao nhiêu giờ"
                min={1}
                max={23}
                disabled={isActionLoading}
                {...form.getInputProps('everyHours')}
              />
              <NumberInput
                label="Vào phút thứ"
                min={0}
                max={59}
                disabled={isActionLoading}
                {...form.getInputProps('minute')}
              />
            </Group>
          )}

          {form.values.scheduleType === 'daily' && (
            <TextInput
              label="Thời gian chạy (Giờ server)"
              type="time"
              disabled={isActionLoading}
              {...form.getInputProps('time')}
            />
          )}

          {form.values.scheduleType === 'weekly' && (
            <>
              <Checkbox.Group
                label="Chọn các ngày chạy trong tuần"
                disabled={isActionLoading}
                {...form.getInputProps('daysOfWeek')}
              >
                <Group mt="xs">
                  {dayOptions.map((day) => (
                    <Checkbox key={day.value} value={day.value} label={day.label} />
                  ))}
                </Group>
              </Checkbox.Group>
              <TextInput
                label="Thời gian chạy (Giờ server)"
                type="time"
                disabled={isActionLoading}
                {...form.getInputProps('time')}
              />
            </>
          )}

          <Checkbox
            label="Kích hoạt lịch hẹn giờ này"
            disabled={isActionLoading}
            {...form.getInputProps('enabled', { type: 'checkbox' })}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} disabled={isActionLoading}>
              Hủy
            </Button>
            <Button type="submit" loading={isActionLoading}>
              {job ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
