# Quan ly server JX

Huong dan nay danh cho nguoi moi, khong can biet nhieu ve IT. Ban chi can cai Docker, tai ma nguon, chay lenh khoi dong, sau do cau hinh va dieu khien server tren giao dien Web.

## Luu y truoc khi cai

- Uu tien chay tren Ubuntu/Linux server.
- Windows/macOS Docker Desktop chua duoc test day du. Co the gap loi do co che network, Docker socket va duong dan file khac Linux.
- File `.env` da co san trong repo va co the sua tren Web o muc Cai dat. File nay co mat khau mac dinh, can doi truoc khi dung ngoai may ca nhan hoac mang LAN tin cay.
- Web Manager co quyen dieu khien Docker tren may chu. Chi dung trong mang LAN tin cay, khong mo cong ra Internet cong cong.

## 1. Cai Docker

Vao trang chu Docker, tai ban phu hop voi he dieu hanh cua ban va cai dat theo huong dan cua Docker.

Sau khi cai xong, mo Terminal va kiem tra:

```bash
docker --version
docker compose version
```

Neu hai lenh tren hien version, Docker da san sang.

## 2. Tai ma nguon

Mo Terminal, chay:

```bash
git clone https://github.com/hungnt87/quanlysvJX.git
cd quanlysvJX
```

## 3. Kiem tra file cau hinh `.env`

Repo da co file `.env` o thu muc goc. Ban co the mo file nay bang text editor neu muon xem nhanh.

Nhung cach de sua de nhat la sau khi Web chay:

1. Vao `http://localhost`.
2. Mo `Cai dat`.
3. Chon tab `Bien moi truong (.env)`.
4. Sua cau hinh can thiet va bam luu.

Cac muc thuong can quan tam:

- `JX_IP`: IP cua may chay server game trong mang LAN.
- `JX_MYSQL_IP`, `JX_PAYSYS_IP`, `JX_MSSQL_IP`: IP ket noi giua cac dich vu JX.
- `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE`: tai khoan database cho Web Manager.
- `BACKUP_SCHEDULER_ENABLED`: bat/tat lich sao luu tu dong.

`SERVER_PATH` se duoc Web tu cap nhat khi ban kich hoat phien ban game, khong can sua tay luc moi cai.

## 4. Khoi dong Web Manager

Tai thu muc goc cua repo, chay:

```bash
cd quanlysvJX
docker compose up -d --build
```

Lenh nay se build va chay:

- API quan ly o cong `3001`
- Giao dien Web o cong `80`

Mo trinh duyet:

- Tren may dang chay server: `http://localhost`
- Tu may khac cung LAN: `http://<IP-may-chu>`

Vi du: `http://192.168.10.4`

## 5. Cai dat va kich hoat phien ban game

Sau khi mo Web, can cai dat phien ban game truoc khi chay service.

1. Vao `Cai dat`.
2. Chon tab `Phien ban game`.
3. Tai len file `.zip`, `.tar.gz`, `.tgz` hoac clone tu GitHub.
4. Chon dung thu muc server neu Web yeu cau.
5. Bam kich hoat phien ban.

Neu chua kich hoat phien ban game, Dashboard se khong cho chay cac dich vu game.

## 6. Cau hinh IP game

Vao `Cai dat` de cau hinh IP game.

- `Game server IP`: chon IP that cua may chu trong mang LAN.
- Neu muon choi tu ngoai Internet qua VPN, chon IP VPN cua may chu thay vi IP LAN.
- May choi game cung can ket noi vao cung VPN va truy cap server bang IP VPN nay.
- `MySQL IP`, `Paysys IP`, `MSSQL IP`: thuong de `127.0.0.1` khi chay tat ca tren cung may.

Sau khi luu cau hinh IP, restart cac dich vu dang chay de cau hinh moi co hieu luc.

## 7. Chay va quan ly dich vu JX

Vao `Bang dieu khien`.

Tai day co the:

- Xem trang thai dich vu.
- Chuan bi image neu dich vu chua co image.
- Bat/tat tung dich vu JX.
- Xem log truc tiep khi service dang khoi dong.

Nen khoi dong theo giao dien Web thay vi tu go lenh trong `apps/jx-services`.

## 8. Quan ly tai khoan game

Vao `Tai khoan`.

Tai day co the:

- Tao tai khoan game.
- Doi mat khau.
- Doi mat khau cap 2.
- Gia han tai khoan.
- Khoa/mo khoa tai khoan.
- Xoa mem tai khoan.

Tinh nang nay can MSSQL chay dung va thong tin MSSQL trong `.env` phai chinh xac.

## 9. Sao luu va phuc hoi

Vao `Sao luu`.

Tai day co the:

- Tao ban sao luu thu cong.
- Xem danh sach file sao luu.
- Ghi chu/chinh sua thong tin file sao luu.
- Phuc hoi du lieu tu ban sao luu.
- Cau hinh lich sao luu tu dong.

Sao luu tu dong duoc bat/tat bang `BACKUP_SCHEDULER_ENABLED` trong `.env` va cau hinh chi tiet trong tab sao luu tren Web.

## Loi thuong gap

### Docker chua chay

Neu `docker compose up -d --build` bao loi ket noi Docker, hay mo Docker Desktop hoac khoi dong Docker service tren Linux.

### Khong mo duoc Web

Kiem tra container:

```bash
docker compose ps
```

Neu UI/API chua chay, xem log:

```bash
docker compose logs -f
```

### Web bao chua kich hoat phien ban game

Vao `Cai dat` -> `Phien ban game`, tai len hoac clone phien ban game, sau do kich hoat.

### Khong quan ly duoc tai khoan

Kiem tra MSSQL da chay va thong tin `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE` trong `.env` dung.

### Chay tren Windows/macOS bi loi

Moi truong Windows/macOS Docker Desktop chua test day du. Neu gap loi network, duong dan volume, hoac Docker socket, hay chay tren Ubuntu/Linux server.

## Bao mat

Du an hien phu hop dung trong LAN/noi bo. Khong public Web Manager ra Internet khi chua co dang nhap, phan quyen, HTTPS va cau hinh firewall phu hop.
