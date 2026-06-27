import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { User } from '../../../types';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { GlassContainer } from '../../../components/GlassContainer';
import { COLORS } from '../../../constants/colors';

interface UserCardProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit, onDelete }) => {
  return (
    <GlassContainer style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{user.fullName}</Text>
        <Badge role={user.role} />
      </View>
      <Text style={styles.cardInfo}>@{user.username}</Text>
      <Text style={styles.cardInfo}>{user.email}</Text>
      <Text style={styles.cardId}>ID: {user.id.substring(0, 8)}...</Text>

      <View style={styles.cardActions}>
        <Button title="Edit" variant="primary" onPress={() => onEdit(user)} style={styles.actionBtn} />
        <Button title="Delete" variant="danger" onPress={() => onDelete(user.id)} style={styles.actionBtn} />
      </View>
    </GlassContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardInfo: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  cardId: {
    color: COLORS.cancel,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
