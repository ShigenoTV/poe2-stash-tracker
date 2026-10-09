//! Capture de la fenêtre de PoE2.
//!
//! On tente d'abord Windows Graphics Capture (GPU, fonctionne même si la fenêtre est
//! recouverte), puis on retombe sur GDI (`PrintWindow`, puis copie de l'écran) si WGC
//! est indisponible, expire ou renvoie une image noire.

#![cfg_attr(not(windows), allow(dead_code))]


/// Morceau du titre de la fenêtre du jeu.
pub const GAME_WINDOW_TITLE: &str = "Path of Exile 2";

/// Image RGBA 8 bits, sans padding.
pub struct Captured {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// Une image presque entièrement noire signale une capture ratée
/// (fenêtre DirectX en plein écran exclusif sous GDI, fenêtre minimisée…).
pub fn looks_black(rgba: &[u8]) -> bool {
    let pixels = rgba.len() / 4;
    if pixels == 0 {
        return true;
    }
    let step = (pixels / 4096).max(1);
    let lit = rgba
        .chunks_exact(4)
        .step_by(step)
        .filter(|p| u16::from(p[0]) + u16::from(p[1]) + u16::from(p[2]) > 24)
        .count();
    lit * 100 < pixels.div_ceil(step)
}

#[cfg(windows)]
pub use win::capture_game_window;

#[cfg(not(windows))]
pub fn capture_game_window() -> Result<Captured, String> {
    Err("La capture d'écran n'est disponible que sous Windows.".into())
}

#[cfg(windows)]
mod win {
    use super::{looks_black, Captured, GAME_WINDOW_TITLE};
    use std::sync::{mpsc, Mutex};
    use std::time::Duration;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, SRCCOPY,
    };
    use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsIconic};
    use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
    use windows_capture::frame::Frame;
    use windows_capture::graphics_capture_api::InternalCaptureControl;
    use windows_capture::settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    };
    use windows_capture::window::Window;

    /// `PW_RENDERFULLCONTENT` : demande à DWM le contenu réel, y compris DirectX.
    const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);
    const WGC_TIMEOUT: Duration = Duration::from_secs(3);

    type FrameSender = Mutex<mpsc::Sender<(u32, u32, Vec<u8>)>>;

    struct OneFrame {
        tx: FrameSender,
    }

    impl GraphicsCaptureApiHandler for OneFrame {
        type Flags = FrameSender;
        type Error = String;

        fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
            Ok(Self { tx: ctx.flags })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            capture_control: InternalCaptureControl,
        ) -> Result<(), Self::Error> {
            let buffer = frame.buffer().map_err(|e| e.to_string())?;
            let (w, h) = (buffer.width(), buffer.height());
            let mut scratch = Vec::new();
            let pixels = buffer.as_nopadding_buffer(&mut scratch).to_vec();
            let _ = self.tx.lock().map_err(|e| e.to_string())?.send((w, h, pixels));
            capture_control.stop();
            Ok(())
        }
    }

    fn find_window() -> Result<Window, String> {
        Window::from_contains_name(GAME_WINDOW_TITLE)
            .map_err(|_| format!("Fenêtre « {GAME_WINDOW_TITLE} » introuvable : le jeu est-il lancé ?"))
    }

    fn capture_wgc(window: Window) -> Result<Captured, String> {
        let (tx, rx) = mpsc::channel();
        let settings = Settings::new(
            window,
            CursorCaptureSettings::WithoutCursor,
            DrawBorderSettings::WithoutBorder,
            SecondaryWindowSettings::Default,
            MinimumUpdateIntervalSettings::Default,
            DirtyRegionSettings::Default,
            ColorFormat::Rgba8,
            Mutex::new(tx),
        );
        let control = OneFrame::start_free_threaded(settings).map_err(|e| format!("WGC : {e}"))?;
        let result = rx.recv_timeout(WGC_TIMEOUT);
        let _ = control.stop();
        let (width, height, rgba) = result.map_err(|_| "WGC : aucune image reçue".to_string())?;
        Ok(Captured { width, height, rgba })
    }

    fn capture_gdi(hwnd: HWND) -> Result<Captured, String> {
        unsafe {
            if IsIconic(hwnd).as_bool() {
                return Err("La fenêtre du jeu est réduite.".into());
            }
            let mut rect = Default::default();
            GetWindowRect(hwnd, &mut rect).map_err(|e| format!("GDI : {e}"))?;
            let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
            if w <= 0 || h <= 0 {
                return Err("GDI : fenêtre de taille nulle".into());
            }

            let screen = GetDC(None);
            let mem = CreateCompatibleDC(Some(screen));
            let bitmap = CreateCompatibleBitmap(screen, w, h);
            let previous = SelectObject(mem, bitmap.into());

            let mut ok = PrintWindow(hwnd, mem, PW_RENDERFULLCONTENT).as_bool();
            if !ok {
                // Dernier recours : copie de la zone d'écran (la fenêtre doit être visible).
                ok = BitBlt(mem, 0, 0, w, h, Some(screen), rect.left, rect.top, SRCCOPY).is_ok();
            }

            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // négatif : lignes de haut en bas
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bgra = vec![0u8; (w * h * 4) as usize];
            let lines = if ok {
                GetDIBits(mem, bitmap, 0, h as u32, Some(bgra.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS)
            } else {
                0
            };

            SelectObject(mem, previous);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);

            if lines == 0 {
                return Err("GDI : capture impossible".into());
            }
            for px in bgra.chunks_exact_mut(4) {
                px.swap(0, 2);
                px[3] = 255;
            }
            Ok(Captured { width: w as u32, height: h as u32, rgba: bgra })
        }
    }

    pub fn capture_game_window() -> Result<Captured, String> {
        let window = find_window()?;
        let hwnd = HWND(window.as_raw_hwnd());
        let wgc_error = match capture_wgc(window) {
            Ok(img) if !looks_black(&img.rgba) => return Ok(img),
            Ok(_) => "WGC : image noire".to_string(),
            Err(e) => e,
        };
        match capture_gdi(hwnd) {
            Ok(img) if !looks_black(&img.rgba) => Ok(img),
            Ok(_) => Err(format!("{wgc_error} ; GDI : image noire (passe le jeu en fenêtré sans bordure)")),
            Err(e) => Err(format!("{wgc_error} ; {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::looks_black;

    #[test]
    fn detects_black_frames() {
        assert!(looks_black(&[]));
        assert!(looks_black(&[0, 0, 0, 255].repeat(10_000)));
        let mut img = [0, 0, 0, 255].repeat(10_000);
        for px in img.chunks_exact_mut(4).take(2_000) {
            px[0] = 200;
        }
        assert!(!looks_black(&img));
    }
}
