import { Chip } from '@mui/material';

const statusConfig = {
  PENDING: { color: 'warning', label: 'Pending' },
  APPROVED: { color: 'info', label: 'Approved' },
  PRINTING: { color: 'primary', label: 'Printing' },
  COMPLETED: { color: 'success', label: 'Completed' },
  REJECTED: { color: 'error', label: 'Rejected' },
  CANCELLED: { color: 'default', label: 'Cancelled' },
  PAID: { color: 'success', label: 'Paid' },
  UNPAID: { color: 'warning', label: 'Unpaid' },
};

export default function OrderStatusBadge({ status }) {
  const config = statusConfig[status] || { color: 'default', label: status };
  return <Chip label={config.label} color={config.color} size="small" variant="outlined" />;
}
