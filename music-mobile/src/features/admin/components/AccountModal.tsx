import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { COLORS } from '../../../constants/colors';

import { User } from '../../../types';

interface AccountModalProps {
  visible: boolean;
  isEditMode: boolean;
  initialData?: User | null;
  onClose: () => void;
  onSave: (data: { username: string; email: string; fullName: string; password?: string }) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ visible, isEditMode, initialData, onClose, onSave }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsername(initialData?.username || '');
      setEmail(initialData?.email || '');
      setFullName(initialData?.fullName || '');
      setPassword('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({ username, email, fullName, password });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{isEditMode ? 'Edit Account' : 'Add Account'}</Text>

          <Input placeholder="Username" value={username} onChangeText={setUsername} />
          <Input placeholder="Email" value={email} onChangeText={setEmail} />
          <Input placeholder="Full Name" value={fullName} onChangeText={setFullName} />
          <Input
            placeholder={isEditMode ? 'Password (Leave empty to keep)' : 'Password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View style={styles.modalActions}>
            <Button title="Cancel" variant="cancel" onPress={onClose} style={styles.btnAction} />
            <Button title="Save" variant="save" onPress={handleSave} style={styles.btnAction} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surfaceSolid,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 16,
  },
  btnAction: {
    flex: 1,
  },
});
