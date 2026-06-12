import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, TextInputProps } from 'react-native';

/**
 * Champ mot de passe avec bouton œil pour révéler/masquer (specs §3.1 « œil »).
 * S'utilise comme un <TextInput> : on passe le même `style` que les autres champs,
 * les marges sont reportées sur le conteneur pour garder l'œil centré sur le champ.
 */
export default function PasswordInput({ style, ...props }: TextInputProps) {
    const [visible, setVisible] = useState(false);
    const flat: any = StyleSheet.flatten(style) || {};
    const { margin, marginVertical, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, ...inputStyle } = flat;
    const wrapStyle = { margin, marginVertical, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal };

    return (
        <View style={[styles.wrap, wrapStyle]}>
            <TextInput
                {...props}
                style={[inputStyle, styles.input]}
                secureTextEntry={!visible}
            />
            <TouchableOpacity
                style={styles.eye}
                onPress={() => setVisible(v => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
                <Text style={[styles.eyeIcon, { opacity: visible ? 0.35 : 1 }]}>👁️</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'relative', justifyContent: 'center' },
    input: { paddingRight: 48 },
    eye: { position: 'absolute', right: 0, top: 0, bottom: 0, paddingHorizontal: 14, justifyContent: 'center' },
    eyeIcon: { fontSize: 18 },
});
