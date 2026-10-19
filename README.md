# Camera Coach (web)

Trợ lý chụp ảnh chạy trên trình duyệt. Trong lúc bạn ngắm, trang gửi khung hình xem trước lên Claude và **đọc chỉ dẫn tiếng Việt qua loa hoặc tai nghe**, ví dụ "xoay máy sang trái một chút", "lùi lại một bước", "ổn rồi, chụp đi!".

Viết bằng TypeScript thuần + Vite, không dùng framework. Có sẵn bộ test Playwright.

## Cách hoạt động

```
Camera (getUserMedia, khung 768px) ──┐
Cảm biến nghiêng (deviceorientation) ─┼─► Claude API ─► {instruction, ready} ─► Giọng đọc vi-VN (speechSynthesis)
Chủ đề + chỉ dẫn trước đó ───────────┘                                         │
           ▲                                                                    │
           └──────────── nói xong + nghỉ 1 giây thì hỏi tiếp ◄──────────────────┘
```

- Độ nghiêng đo bằng cảm biến rồi gửi kèm dưới dạng chữ ("đầu máy nghiêng sang phải 7°"), vì chỉ nhìn ảnh thì AI khó biết máy lệch bao nhiêu độ.
- Khi AI trả `ready: true`, viền khung ngắm chuyển xanh.
- Đường thăng bằng giữa khung chạy ngay trên máy, không chờ AI.

## Chạy thử

Cần Node.js 18 trở lên.

```bash
npm install
npm run dev            # mở http://localhost:5173, dùng webcam máy tính
```

### Mở trên điện thoại

Trình duyệt điện thoại chỉ cho dùng camera trên HTTPS. Có hai cách:

1. **Cùng mạng Wi-Fi:** chạy `npm run dev:phone`, mở địa chỉ `https://<IP-máy-tính>:5173` mà terminal in ra. Trình duyệt sẽ cảnh báo chứng chỉ tự ký: chọn "Nâng cao" › "Tiếp tục".
2. **Deploy:** `npm run build` rồi đưa thư mục `dist/` lên Netlify, Vercel hoặc GitHub Pages (đều có HTTPS miễn phí).

Khi mở trang: bấm **Bật camera** › cho phép camera (và cảm biến chuyển động trên iPhone) › nhập API key (tạo tại console.anthropic.com) › đeo tai nghe › bấm **Bật AI**.

## Test với Playwright

```bash
npx playwright install chromium   # lần đầu
npm test                          # chạy tất cả, tự bật dev server
npm run test:ui                   # chế độ UI để xem từng bước
npm run test:report               # mở báo cáo HTML
```

| File | Kiểm tra gì |
|---|---|
| `tests/prompting.spec.ts` | Logic thuần: đọc JSON từ AI, đổi góc cảm biến thành độ nghiêng, câu mô tả tiếng Việt |
| `tests/app.spec.ts` | Luồng người dùng: hiện và đọc chỉ dẫn, viền xanh khi ổn, tắt thì ngừng gọi AI, API key sai thì tự dừng, nhập key, đường thăng bằng, chụp ảnh |

Một vài kỹ thuật dùng trong test:

- **Camera giả:** Chromium chạy với `--use-fake-device-for-media-stream`, nên có hình động mà không cần webcam.
- **Mock API:** `page.route()` chặn request tới `api.anthropic.com` và trả câu trả lời dựng sẵn, nên test không tốn tiền và luôn ra cùng kết quả.
- **Giọng đọc giả:** `page.addInitScript()` thay `window.speechSynthesis` bằng bản ghi lại các câu được đọc vào `window.__spoken`.
- **Cảm biến giả:** `page.evaluate()` bắn sự kiện `DeviceOrientationEvent` với góc tự chọn.
- Mọi phần tử cần test đều có `data-testid`. Test chạy trên hai cấu hình: Pixel 7 (di động) và Chrome máy tính.

## Các file chính

| File | Vai trò |
|---|---|
| `src/main.ts` | Gắn giao diện với logic |
| `src/camera.ts` | Mở camera sau, lấy khung hình JPEG, chụp ảnh |
| `src/motion.ts` | Cảm biến nghiêng, xin quyền trên iOS |
| `src/guidance.ts` | Vòng lặp hỏi AI › đọc › nghỉ, chống nhắc lặp, tự dừng sau 3 lỗi |
| `src/claude.ts` | Gọi Messages API kèm ảnh |
| `src/prompting.ts` | System prompt, tính độ nghiêng, đọc JSON trả về |
| `src/speech.ts` | Giọng đọc tiếng Việt |
| `src/settings.ts` | API key, model, chủ đề, thời gian nghỉ (lưu trong localStorage) |

## Lưu ý

- **API key:** key do người dùng tự nhập và chỉ lưu trong trình duyệt của họ, không nằm trong mã nguồn. Vì vậy deploy trang lên mạng vẫn an toàn. Tuy nhiên, đừng bao giờ ghi cứng key của bạn vào code. Nếu muốn người khác dùng mà không cần key riêng, hãy làm một backend nhỏ giữ key.
- **Độ trễ:** mỗi chỉ dẫn mất khoảng 1–3 giây, nên chỉnh máy từ từ.
- **Chi phí:** khi bật, trang gọi API khoảng 15–25 lần mỗi phút. Hãy tắt khi không dùng, hoặc tăng thời gian nghỉ trong Cài đặt.
- **Giọng đọc tiếng Việt:** iPhone có sẵn. Trên Android, nếu giọng không phải tiếng Việt, cài "Dịch vụ lời nói của Google" và tải gói tiếng Việt trong Cài đặt › Chuyển văn bản thành giọng nói.
- **Lưu ảnh:** chạm vào ảnh nhỏ. Trên điện thoại, trang sẽ mở bảng chia sẻ để bạn chọn "Lưu hình ảnh". Trên máy tính, ảnh được tải về.
