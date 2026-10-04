import { useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Avatar, Icon, Sheet, SheetOption, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import type { LocalFile } from '@/lib/files';
import { useSession } from '@/lib/session';
import { studentsService } from '@/services/students.service';
import { uploadsService } from '@/services/uploads.service';
import { colors, space } from '@/theme/tokens';

/** Profile photos are stored as 512 px squares: sharp on every screen, small to upload. */
const SIZE = 512;

const PICKER: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // The phone's own crop screen, locked to a square.
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
};

/** Centre-crops to a square (in case the picker returned a rectangle) and scales to 512 px. */
async function squarePhoto(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    context.crop({
      originX: Math.round((asset.width - side) / 2),
      originY: Math.round((asset.height - side) / 2),
      width: side,
      height: side,
    });
  }
  context.resize({ width: SIZE, height: SIZE });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return { uri: result.uri, name: 'avatar.jpg', type: 'image/jpeg' };
}

/**
 * The member's own profile photo: tap to take or choose one, crop it square, and it is saved at
 * once. Also lets them remove it (initials show again).
 */
export function AvatarEditor({ size = 96 }: { size?: number }) {
  const { user, refreshUser } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function save(avatarUrl: string | null, done: string) {
    await studentsService.updateProfile({ avatarUrl });
    await refreshUser();
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    toast(done);
  }

  async function choose(source: 'camera' | 'library') {
    setOpen(false);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER)
          : await ImagePicker.launchImageLibraryAsync(PICKER);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setBusy(true);
      const file = await squarePhoto(asset);
      const uploaded = await uploadsService.uploadImage(file);
      await save(uploaded.data.url, 'Profile photo updated');
    } catch (error) {
      toast(errorMessage(error, 'Could not update your photo.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setOpen(false);
    setBusy(true);
    try {
      await save(null, 'Profile photo removed');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const badge = Math.max(28, Math.round(size * 0.32));

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={user.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
        disabled={busy}
        onPress={() => setOpen(true)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Avatar name={user.name} imageUrl={user.avatarUrl} size={size} />
        {busy ? (
          <View style={[styles.busy, { width: size, height: size, borderRadius: size / 2 }]}>
            <ActivityIndicator color={colors.surface} />
          </View>
        ) : null}
        <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2 }]}>
          <Icon name="camera" size={badge * 0.55} color={colors.surface} />
        </View>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Profile photo">
        <SheetOption icon="camera-outline" label="Take a photo" onPress={() => void choose('camera')} />
        <SheetOption icon="images-outline" label="Choose from gallery" onPress={() => void choose('library')} />
        {user.avatarUrl ? (
          <SheetOption icon="trash-outline" label="Remove photo" danger onPress={() => void remove()} />
        ) : null}
        <AppText variant="caption" style={styles.hint}>
          You can move and zoom to crop it square before it is saved.
        </AppText>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pressed: { opacity: 0.85 },
  busy: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(3,29,64,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: colors.action,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { paddingHorizontal: space.md, paddingVertical: space.sm },
});
