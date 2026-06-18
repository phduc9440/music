import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';

interface BadgeProps {
  role: string;
}

export const Badge: React.FC<BadgeProps> = ({ role }) => {
  const isAdmin = role === 'ADMIN';

  return (
    <View style={[styles.badge, isAdmin ? styles.badgeAdmin : styles.badgeUser]}>
      <Text style={[styles.badgeText, isAdmin ? styles.badgeAdminText : styles.badgeUserText]}>
        {role}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeUser: {
    backgroundColor: COLORS.badgeUserBg,
  },
  badgeAdmin: {
    backgroundColor: COLORS.badgeAdminBg,
  },
  badgeUserText: {
    color: COLORS.badgeUserText,
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeAdminText: {
    color: COLORS.badgeAdminText,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
