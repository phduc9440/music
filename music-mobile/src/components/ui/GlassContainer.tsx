import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { COLORS } from '../../constants/colors';

interface GlassContainerProps extends ViewProps {
  children: React.ReactNode;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({ children, style, ...props }) => {
  return (
    <View style={[styles.container, style]} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
