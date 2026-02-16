import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  icon?: 'wifi' | 'warning' | 'time' | 'alert-circle';
  message: string;
  subtitle?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  wifi: 'cloud-offline',
  warning: 'warning',
  time: 'time',
  'alert-circle': 'alert-circle',
};

export const ErrorState: React.FC<Props> = ({
  icon = 'warning',
  message,
  subtitle,
  onRetry,
  retryLabel = 'Try Again',
}) => {
  return (
    <View style={styles.container}>
      <Ionicons
        name={ICON_MAP[icon] ?? 'warning'}
        size={48}
        color="rgba(255,255,255,0.2)"
      />
      <Text style={styles.message}>{message}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={16} color="#60A5FA" />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  message: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.2)',
  },
  retryText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
});
