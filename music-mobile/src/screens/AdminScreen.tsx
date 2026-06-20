import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminApi } from '../api';
import { User } from '../types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { UserCard } from '../components/features/UserCard';
import { AccountModal } from '../components/features/AccountModal';
import { COLORS } from '../constants/colors';

type AdminScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Admin'>;

interface Props {
  navigation: AdminScreenNavigationProp;
}

export default function AdminScreen({ navigation }: Props) {
  const [admin, setAdmin] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [adminRes, accountsRes] = await Promise.all([
        adminApi.getMe(),
        adminApi.getAccounts(1, 50)
      ]);
      setAdmin(adminRes.data.result);
      setAccounts(accountsRes.data.result.data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load data. Please login again.');
      handleLogout();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    navigation.replace('Login');
  };

  const openModal = (editMode = false, acc?: User) => {
    setIsEditMode(editMode);
    setCurrentAccount(acc || null);
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const handleSave = async (data: any) => {
    if (!data.username || !data.email || !data.fullName) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    try {
      if (isEditMode && currentAccount) {
        await adminApi.updateAccount(currentAccount.id, data);
        Alert.alert('Success', 'Account updated');
      } else {
        await adminApi.createAccount(data);
        Alert.alert('Success', 'Account created');
      }
      closeModal();
      setIsLoading(true);
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to save account');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete this account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deleteAccount(id);
              Alert.alert('Success', 'Account deleted');
              setIsLoading(true);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to delete');
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subHeaderText}>Welcome, {admin?.fullName}</Text>
        <TouchableOpacity style={styles.btnAdd} onPress={() => openModal(false)}>
          <Text style={styles.btnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UserCard user={item} onEdit={acc => openModal(true, acc)} onDelete={handleDelete} />
        )}
        contentContainerStyle={styles.listContent}
      />

      <AccountModal 
        visible={isModalVisible}
        isEditMode={isEditMode}
        initialData={currentAccount}
        onClose={closeModal}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.secondary, fontSize: 20, fontWeight: 'bold' },
  logoutText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  subHeaderText: { color: COLORS.textSecondary, fontSize: 16 },
  btnAdd: { backgroundColor: COLORS.secondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: COLORS.white, fontWeight: 'bold', textAlign: 'center' },
  listContent: { padding: 20 },
});
