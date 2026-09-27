import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Icon, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import type { LocalFile } from '@/lib/files';
import { mediaUrl } from '@/lib/media';
import { uploadsService } from '@/services/uploads.service';
import { colors, radius, space } from '@/theme/tokens';

const MAX_EDGE = 1600;

/**
 * Turns a picked asset into the `{ uri, name, type }` React Native uploads, scaled down to at most
 * 1600 px and re-encoded as JPEG: phone camera photos are often bigger than the API's 5 MB limit.
 */
export async function toLocalFile(asset: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const landscape = asset.width >= asset.height;
  const tooBig = Math.max(asset.width, asset.height) > MAX_EDGE;
  const context = ImageManipulator.manipulate(asset.uri);
  if (tooBig) context.resize(landscape ? { width: MAX_EDGE } : { height: MAX_EDGE });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: result.uri, name: 'photo.jpg', type: 'image/jpeg' };
}

/** Asks for a photo from the camera or the gallery. Resolves null when the user cancels. */
export function pickPhoto(options: { allowsEditing?: boolean } = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: options.allowsEditing ?? false,
  };
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      {
        text: 'Take photo',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync(pickerOptions);
          resolve(result.canceled ? null : (result.assets[0] ?? null));
        },
      },
      {
        text: 'Choose from gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
          resolve(result.canceled ? null : (result.assets[0] ?? null));
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/**
 * Up to `max` photos, each uploaded as soon as it is picked; `value` holds the uploaded URLs the
 * API expects in `images`.
 */
export function PhotoPicker({
  value,
  onChange,
  max,
  error,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max: number;
  error?: string;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function add() {
    const asset = await pickPhoto();
    if (!asset) return;
    setUploading(true);
    try {
      const result = await uploadsService.uploadImage(await toLocalFile(asset));
      onChange([...value, result.data.url]);
    } catch (caught) {
      toast(errorMessage(caught, 'Could not upload the photo.'), 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {value.map((url, index) => (
          <View key={url} style={styles.thumb}>
            <Image source={{ uri: mediaUrl(url) }} style={styles.thumbImage} contentFit="cover" />
            {index === 0 ? (
              <View style={styles.cover}>
                <AppText variant="caption" color={colors.surface}>
                  Cover
                </AppText>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="Remove photo"
              hitSlop={8}
              onPress={() => onChange(value.filter((item) => item !== url))}
              style={styles.remove}
            >
              <Icon name="close" size={14} color={colors.surface} />
            </Pressable>
          </View>
        ))}
        {value.length < max ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            disabled={uploading}
            onPress={() => void add()}
            style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.action} />
            ) : (
              <>
                <Icon name="camera" size={24} color={colors.action} />
                <AppText variant="caption" color={colors.action}>
                  {value.length === 0 ? 'Add photos' : `${value.length}/${max}`}
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
      {error ? (
        <AppText variant="small" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const SIZE = 96;

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { gap: space.sm, paddingVertical: space.xs },
  thumb: { width: SIZE, height: SIZE, borderRadius: radius.md, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  cover: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 2,
    alignItems: 'center',
    backgroundColor: 'rgba(11,18,32,0.55)',
  },
  remove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(11,18,32,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.actionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
