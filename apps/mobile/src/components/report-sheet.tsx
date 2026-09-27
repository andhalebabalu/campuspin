import { REPORT_REASON_LABELS, type ReportReason } from '@platform/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, SheetOption, TextField, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { space } from '@/theme/tokens';

/** Pick a reason (and optionally say more), then send the report. */
export function ReportSheet<R extends ReportReason>({
  visible,
  title,
  reasons,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  reasons: readonly R[];
  onClose: () => void;
  onSubmit: (dto: { reason: R; description?: string }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<R | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setReason(null);
    setDetails('');
    onClose();
  }

  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      await onSubmit({ reason, ...(details.trim() ? { description: details.trim() } : {}) });
      toast('Thanks. Our team will take a look.');
      close();
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {reasons.map((item) => (
        <SheetOption
          key={item}
          label={REPORT_REASON_LABELS[item]}
          selected={reason === item}
          onPress={() => setReason(item)}
        />
      ))}
      <View style={styles.footer}>
        <TextField
          placeholder="Anything else we should know? (optional)"
          value={details}
          onChangeText={setDetails}
          maxLength={1000}
        />
        <Button title="Send report" variant="danger" disabled={!reason} loading={busy} onPress={() => void send()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space.md, paddingHorizontal: space.sm, paddingTop: space.md },
});
