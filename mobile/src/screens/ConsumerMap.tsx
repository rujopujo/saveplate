import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, Alert, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import io from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

interface Pin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  quantity: number;
  discountTier: 'FREE' | '75% OFF' | '50% OFF';
  pickupWindowEnd: string;
}

const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { padding: 0; margin: 0; background-color: #1a1a2e; }
    html, body, #map { height: 100%; width: 100%; }
    .leaflet-container { background: #1a1a2e; }
    .leaflet-popup-content-wrapper { background: #16213e; color: #fff; border: 1px solid #FF8C00; }
    .leaflet-popup-tip { background: #16213e; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [19.076, 72.8777],
      zoom: 12,
      maxBounds: [[18.85, 72.7], [19.35, 73.05]]
    });
    
    // Using a dark theme tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    var markers = {};

    function getColor(tier) {
      if(tier === 'FREE') return '#00C851';
      if(tier === '75% OFF') return '#FF8C00';
      return '#ffbb33';
    }

    window.addPin = function(pin) {
      if(markers[pin.id]) return;
      var marker = L.circleMarker([pin.lat, pin.lng], {
        color: getColor(pin.discountTier),
        radius: 8,
        fillOpacity: 0.8,
        weight: 2
      }).addTo(map);
      
      marker.bindPopup('<b>' + pin.name + '</b><br>Qty: ' + pin.quantity + '<br>' + pin.discountTier);
      marker.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pinTap', data: pin }));
      });
      markers[pin.id] = marker;
    };

    window.updatePin = function(id, qty) {
      if(markers[id]) {
        var popupContent = markers[id].getPopup().getContent();
        popupContent = popupContent.replace(/Qty: \\d+/, 'Qty: ' + qty);
        markers[id].setPopupContent(popupContent);
      }
    };

    window.removePin = function(id) {
      if(markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
      }
    };
  </script>
</body>
</html>
`;

export default function ConsumerMap() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [passData, setPassData] = useState<{otp: string, qrData: string} | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  
  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<any>(null);
  const { authenticatedFetch, logout } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: location.coords.latitude, lng: location.coords.longitude });
      } catch (e) {
        console.warn("Location unavailable, using default center.");
      }
    })();

    const initSocket = async () => {
      const token = await SecureStore.getItemAsync('accessToken');
      
      socketRef.current = io(API_URL, {
        auth: { token }
      });

      socketRef.current.on('connect', () => {
        if (userLocation) {
          socketRef.current.emit('join_spatial_grid', userLocation);
        }
      });

      socketRef.current.on('new_surplus_pin', (pin: Pin) => {
        setPins(prev => [...prev, pin]);
        webViewRef.current?.injectJavaScript(`window.addPin(${JSON.stringify(pin)}); true;`);
      });

      socketRef.current.on('update_pin_qty', ({ surplusItemId, newQuantity }: { surplusItemId: string, newQuantity: number }) => {
        setPins(prev => prev.map(p => p.id === surplusItemId ? { ...p, quantity: newQuantity } : p));
        webViewRef.current?.injectJavaScript(`window.updatePin('${surplusItemId}', ${newQuantity}); true;`);
      });

      socketRef.current.on('remove_pin', ({ surplusItemId }: { surplusItemId: string }) => {
        setPins(prev => prev.filter(p => p.id !== surplusItemId));
        webViewRef.current?.injectJavaScript(`window.removePin('${surplusItemId}'); true;`);
      });
    };

    initSocket();
    
    // Fetch existing pins on load
    authenticatedFetch(`${API_URL}/api/v1/surplus`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        setPins(data);
        data.forEach(pin => {
          webViewRef.current?.injectJavaScript(`window.addPin(${JSON.stringify(pin)}); true;`);
        });
      }
    })
    .catch(console.error);

    return () => {
      socketRef.current?.disconnect();
    };
  }, []); 

  useEffect(() => {
    if (userLocation && socketRef.current?.connected) {
      socketRef.current.emit('join_spatial_grid', userLocation);
    }
  }, [userLocation]);

  const onMessage = (event: any) => {
    const message = JSON.parse(event.nativeEvent.data);
    if (message.type === 'pinTap') {
      setSelectedPin(message.data);
      setShowClaimModal(true);
    }
  };

  const handleClaim = async () => {
    if (!selectedPin) return;
    setIsClaiming(true);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/v1/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ surplusItemId: selectedPin.id, quantity: 1 })
      });
      const data = await response.json();
      if (response.ok) {
        setShowClaimModal(false);
        setPassData({ otp: data.otp, qrData: data.qrData });
        setShowPassModal(true);
      } else {
        Alert.alert('Claim failed', data.message || 'Sold out');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍽️ Save Plate</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: mapHtml }}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
      />

      <Modal visible={showClaimModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPin && (
              <>
                <Text style={styles.itemTitle}>{selectedPin.name}</Text>
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{selectedPin.discountTier}</Text>
                </View>
                <Text style={styles.itemDesc}>Available Quantity: {selectedPin.quantity}</Text>
                <Text style={styles.itemDesc}>Pickup by: {new Date(selectedPin.pickupWindowEnd).toLocaleTimeString()}</Text>
                
                <TouchableOpacity 
                  style={styles.button} 
                  onPress={handleClaim}
                  disabled={isClaiming}
                >
                  {isClaiming ? <ActivityIndicator color="#1a1a2e" /> : <Text style={styles.buttonText}>Claim 1 Item</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowClaimModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showPassModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {passData && (
              <>
                <Text style={styles.successTitle}>🎉 Claim Successful!</Text>
                <Text style={styles.otpLabel}>Show this OTP to the restaurant:</Text>
                <View style={styles.otpContainer}>
                  <Text style={styles.otp}>{passData.otp}</Text>
                </View>
                <Text style={styles.qrLabel}>Pass ID:</Text>
                <Text style={styles.qrData}>{passData.qrData}</Text>
                <TouchableOpacity style={styles.button} onPress={() => setShowPassModal(false)}>
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { 
    height: 90, 
    backgroundColor: '#1a1a2e', 
    flexDirection: 'row',
    justifyContent: 'space-between', 
    alignItems: 'flex-end', 
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#FF8C00'
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00'
  },
  logoutText: { color: '#FF8C00', fontSize: 14, fontWeight: 'bold' },
  map: { flex: 1, backgroundColor: '#1a1a2e' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26,26,46,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { 
    backgroundColor: '#16213e', 
    borderRadius: 16, 
    padding: 24, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333'
  },
  itemTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 12, textAlign: 'center' },
  badgeContainer: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  badgeText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
  itemDesc: { fontSize: 16, color: '#aaa', marginBottom: 8 },
  button: { 
    backgroundColor: '#FF8C00', 
    paddingHorizontal: 30, 
    paddingVertical: 14, 
    borderRadius: 12, 
    marginTop: 24, 
    width: '100%', 
    alignItems: 'center' 
  },
  buttonText: { color: '#1a1a2e', fontWeight: 'bold', fontSize: 18 },
  cancelButton: { marginTop: 16, padding: 8 },
  cancelText: { color: '#aaa', fontSize: 16 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: '#00C851', marginBottom: 20 },
  otpLabel: { fontSize: 16, color: '#aaa', textAlign: 'center' },
  otpContainer: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#FF8C00'
  },
  otp: { fontSize: 48, fontWeight: 'bold', letterSpacing: 8, color: '#FF8C00' },
  qrLabel: { fontSize: 14, color: '#666', marginTop: 10 },
  qrData: { fontSize: 12, color: '#888', backgroundColor: '#1a1a2e', padding: 12, borderRadius: 8, marginTop: 8, marginBottom: 24, textAlign: 'center', width: '100%' }
});
