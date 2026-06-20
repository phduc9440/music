import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userApi } from '../api';
import { User } from '../types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Badge } from '../components/ui/Badge';
import { GlassContainer } from '../components/ui/GlassContainer';
import { COLORS } from '../constants/colors';

type UserScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'User'>;

interface Props {
  navigation: UserScreenNavigationProp;
}

export default function UserScreen({ navigation }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const response = await userApi.getMe();
      setUser(response.data.result);
    } catch (error) {
      Alert.alert('Error', 'Failed to load profile. Please login again.');
      handleLogout();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    navigation.replace('Login');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const displayName = user?.fullName || user?.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <GlassContainer style={styles.card}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
          <Text style={styles.email}>{user?.email || 'No email provided'}</Text>

          <View style={styles.detailsContainer}>
            <Text style={styles.sectionTitle}>Account Details</Text>
            
            <View style={styles.row}>
              <Text style={styles.label}>Role</Text>
              <Badge role={user?.role || 'USER'} />
            </View>
            
            <View style={styles.row}>
              <Text style={styles.label}>Account ID</Text>
              <Text style={styles.valueText}>{user?.id?.substring(0, 8)}...</Text>
            </View>
          </View>
        </GlassContainer>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.white, fontSize: 20, fontWeight: 'bold' },
  logoutText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
  content: { flex: 1, padding: 20, alignItems: 'center' },
  card: { width: '100%', padding: 24, alignItems: 'center' },
  avatarContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarText: { color: COLORS.white, fontSize: 32, fontWeight: 'bold' },
  name: { fontSize: 24, fontWeight: 'bold', color: COLORS.white, marginBottom: 4 },
  username: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 4 },
  email: { fontSize: 14, color: COLORS.textMuted, marginBottom: 32 },
  detailsContainer: { width: '100%', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16 },
  sectionTitle: { color: COLORS.white, fontSize: 16, fontWeight: '600', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { color: COLORS.textSecondary, fontSize: 14 },
  valueText: { color: COLORS.white, fontSize: 14, fontFamily: 'monospace' },
});
