package com.coffeeshop.tableservice.service;

import com.coffeeshop.tableservice.dto.CallStaffRequest;
import com.coffeeshop.tableservice.dto.CreateTableRequest;
import com.coffeeshop.tableservice.dto.UpdateTableRequest;
import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.coffeeshop.tableservice.repository.TableRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;

@ExtendWith(MockitoExtension.class)
class TableServiceTest {

    @Mock
    private TableRepository tableRepository;

    @Mock
    private QrCodeService qrCodeService;

    @InjectMocks
    private TableService tableService;

    private RestTemplate restTemplate;

    @BeforeEach
    void setUp() {
        restTemplate = (RestTemplate) ReflectionTestUtils.getField(tableService, "restTemplate");
        ReflectionTestUtils.setField(tableService, "chatServiceUrl", "http://chat.local/api/chats");
        ReflectionTestUtils.setField(tableService, "orderServiceUrl", "http://order.local/api/orders");
    }

    @Test
    void findAll_ShouldUseBranchFilterWhenProvided() {
        when(tableRepository.findByBranchId("b1")).thenReturn(List.of(sampleTable("t1", 1)));
        when(tableRepository.findAll()).thenReturn(List.of(sampleTable("t2", 2)));

        assertEquals(1, tableService.findAll("b1").size());
        assertEquals(1, tableService.findAll(null).size());

        verify(tableRepository).findByBranchId("b1");
        verify(tableRepository).findAll();
    }

    @Test
    void findById_ShouldThrowWhenNotFound() {
        when(tableRepository.findById("missing")).thenReturn(Optional.empty());
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.findById("missing"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void create_ShouldPersistAndGenerateQr() {
        CreateTableRequest request = new CreateTableRequest();
        request.setNumber(10);
        request.setCapacity(4);
        request.setArea("A1");
        request.setBranchId("branch-1");

        when(tableRepository.existsByNumber(10)).thenReturn(false);
        when(tableRepository.save(any(CoffeeTable.class)))
                .thenAnswer(invocation -> {
                    CoffeeTable table = invocation.getArgument(0);
                    if (table.getId() == null) {
                        table.setId("t-created");
                    }
                    return table;
                });
        when(qrCodeService.generateQrBase64(any(CoffeeTable.class))).thenReturn("data:image/png;base64,abc");

        CoffeeTable created = tableService.create(request);

        assertEquals("t-created", created.getId());
        assertEquals("data:image/png;base64,abc", created.getQrCode());
        verify(tableRepository, times(2)).save(any(CoffeeTable.class));
        verify(qrCodeService).generateQrBase64(any(CoffeeTable.class));
    }

    @Test
    void create_ShouldThrowWhenNumberExists() {
        CreateTableRequest request = new CreateTableRequest();
        request.setNumber(9);
        request.setCapacity(4);
        when(tableRepository.existsByNumber(9)).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.create(request));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void update_ShouldValidateAndRegenerateQrWhenNumberChanged() {
        CoffeeTable table = sampleTable("t1", 11);
        table.setQrCode("old");
        when(tableRepository.findById("t1")).thenReturn(Optional.of(table));
        when(tableRepository.existsByNumberAndIdNot(22, "t1")).thenReturn(false);
        when(qrCodeService.generateQrBase64(any(CoffeeTable.class))).thenReturn("new-qr");
        when(tableRepository.save(any(CoffeeTable.class))).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateTableRequest request = new UpdateTableRequest();
        request.setNumber(22);
        request.setCapacity(6);
        request.setArea("B2");
        request.setBranchId("branch-2");
        request.setStatus(CoffeeTable.TableStatus.RESERVED);

        CoffeeTable updated = tableService.update("t1", request);

        assertEquals(22, updated.getNumber());
        assertEquals(6, updated.getCapacity());
        assertEquals("B2", updated.getArea());
        assertEquals("branch-2", updated.getBranchId());
        assertEquals(CoffeeTable.TableStatus.RESERVED, updated.getStatus());
        assertEquals("new-qr", updated.getQrCode());
    }

    @Test
    void update_ShouldThrowWhenCapacityInvalid() {
        CoffeeTable table = sampleTable("t2", 2);
        when(tableRepository.findById("t2")).thenReturn(Optional.of(table));

        UpdateTableRequest request = new UpdateTableRequest();
        request.setCapacity(0);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.update("t2", request));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void delete_ShouldThrowWhenOccupied() {
        CoffeeTable table = sampleTable("t3", 3);
        table.setStatus(CoffeeTable.TableStatus.OCCUPIED);
        when(tableRepository.findById("t3")).thenReturn(Optional.of(table));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.delete("t3"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void delete_ShouldThrowWhenHasActiveOrders() {
        CoffeeTable table = sampleTable("t4", 4);
        when(tableRepository.findById("t4")).thenReturn(Optional.of(table));

        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://order.local/api/orders?tableId=t4"))
                .andExpect(method(GET))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("[{\"status\":\"PREPARING\"}]"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.delete("t4"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        server.verify();
    }

    @Test
    void delete_ShouldDeleteWhenNoActiveOrders() {
        CoffeeTable table = sampleTable("t5", 5);
        when(tableRepository.findById("t5")).thenReturn(Optional.of(table));

        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://order.local/api/orders?tableId=t5"))
                .andExpect(method(GET))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("[{\"status\":\"DONE\"}]"));

        Map<String, Object> result = tableService.delete("t5");
        assertEquals("t5", result.get("id"));
        assertEquals(Boolean.TRUE, result.get("deleted"));
        verify(tableRepository).deleteById("t5");
        server.verify();
    }

    @Test
    void updateStatusAndQr_ShouldPersist() {
        CoffeeTable table = sampleTable("t6", 6);
        when(tableRepository.findById("t6")).thenReturn(Optional.of(table));
        when(tableRepository.save(any(CoffeeTable.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(qrCodeService.generateQrBase64(any(CoffeeTable.class), isNull())).thenReturn("qr-6");

        CoffeeTable updated = tableService.updateStatus("t6", CoffeeTable.TableStatus.CLEANING);
        assertEquals(CoffeeTable.TableStatus.CLEANING, updated.getStatus());

        String qr = tableService.getQrCode("t6");
        assertEquals("qr-6", qr);
        verify(tableRepository, atLeast(2)).save(any(CoffeeTable.class));
    }

    @Test
    void getQrBatch_ShouldSortByTableNumberAndReturnPayload() {
        CoffeeTable t1 = sampleTable("t1", 12);
        CoffeeTable t2 = sampleTable("t2", 2);
        when(tableRepository.findAllById(anySet())).thenReturn(List.of(t1, t2));
        when(qrCodeService.generateQrBase64(any(CoffeeTable.class), isNull())).thenReturn("qr");
        when(tableRepository.save(any(CoffeeTable.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<Map<String, String>> payload = tableService.getQrBatch(List.of("t1", "t2"));

        assertEquals(2, payload.size());
        assertEquals("2", payload.get(0).get("number"));
        assertEquals("12", payload.get(1).get("number"));
        verify(tableRepository, times(2)).save(any(CoffeeTable.class));
    }

    @Test
    void callStaff_ShouldCreateMessageInOpenChat() {
        CoffeeTable table = sampleTable("t7", 7);
        when(tableRepository.findById("t7")).thenReturn(Optional.of(table));

        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://chat.local/api/chats?tableId=t7"))
                .andExpect(method(GET))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("[{\"id\":\"chat-1\",\"status\":\"OPEN\"}]"));
        server.expect(requestTo("http://chat.local/api/chats/chat-1/messages"))
                .andExpect(method(POST))
                .andRespond(withStatus(HttpStatus.CREATED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"id\":\"m1\"}"));

        CallStaffRequest request = new CallStaffRequest();
        request.setReason("Can them nuoc");

        Map<String, String> result = tableService.callStaff("t7", request);
        assertEquals("t7", result.get("tableId"));
        assertEquals("Can them nuoc", result.get("reason"));
        server.verify();
    }

    @Test
    void callStaff_ShouldReturnServiceUnavailableWhenChatFails() {
        CoffeeTable table = sampleTable("t8", 8);
        when(tableRepository.findById("t8")).thenReturn(Optional.of(table));

        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://chat.local/api/chats?tableId=t8"))
                .andExpect(method(GET))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("[]"));
        server.expect(requestTo("http://chat.local/api/chats"))
                .andExpect(method(POST))
                .andRespond(withStatus(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{}"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> tableService.callStaff("t8", null));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        server.verify();
    }

    private CoffeeTable sampleTable(String id, int number) {
        CoffeeTable table = new CoffeeTable();
        table.setId(id);
        table.setNumber(number);
        table.setArea("A");
        table.setCapacity(4);
        table.setStatus(CoffeeTable.TableStatus.AVAILABLE);
        return table;
    }
}
